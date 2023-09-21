import { domainmodels, projects, texts, pages, IStructure, datatypes, IAbstractUnit, IModel, JavaScriptSerializer } from "mendixmodelsdk";
import { MendixPlatformClient, OnlineWorkingCopy } from "mendixplatformsdk";
import * as fs from "fs";

// Usage: node horizonextract.js appID branch
//   appID is the appID for the app (taken from the Mendix developer portal page)
//   branch is the name of the branch to use
// Output is written into the folder 'Output'
//
const args = process.argv.slice(2);

var moduleOutput: string;
var appOutput: string;

main(args);

function fixName(name: string): string
{
    return name.replace(/[. ]/g, '$');
}

function exportDocumentJS(document: IAbstractUnit, name: string): string
{
    var header = '\nimport { domainmodels, projects, texts, pages, IStructure, datatypes, IAbstractUnit, JavaScriptSerializer } from "mendixmodelsdk";\n';
    var code = JavaScriptSerializer.serializeToJs(document).slice(9);
    return header + "(function " + fixName(name) + code;
}

function exportDocumentJSON(document: IAbstractUnit): string
{
    return JSON.stringify(document, null, 2);
}

async function processDocument(model: IModel, module: projects.IModule, documentInterface: projects.IDocument, folder: projects.IFolder, level: number)
{
    var spaces = '  '.repeat(level);
    console.log(`${spaces}Document: ${documentInterface.name}`);
    var document = await documentInterface.load();

    fs.writeFileSync("Output/DOC-" + document.qualifiedName + ".json", exportDocumentJSON(document));
    fs.writeFileSync("Output/DOC-" + document.qualifiedName + ".js", exportDocumentJS(document, document.qualifiedName!));

    moduleOutput += '  ' + document.qualifiedName?.replace(".", "$") + '(folder' + fixName(folder.name) + ', model);\n';
}

async function processFolder(model: IModel, module: projects.IModule, folder: projects.IFolder, parent: projects.IFolder, level: number)
{
    var spaces = '  '.repeat(level);
    var name = folder.name.replace(".", "$").replace(" ", "$");
    console.log(`${spaces}Folder: ${folder.name}`);

    moduleOutput += "  var folder" + fixName(folder.name) + " = projects.Folder.createIn(folder" + 
        fixName(parent.name) + ");\n  folder" + fixName(folder.name) + ".name = '" + folder.name + "';\n";

    for (var documentInterface of folder.documents)
    {
        await processDocument(model, module, documentInterface, folder, level + 1);
    }

    for (var folderInterface of folder.folders)
    {
        await processFolder(model, module, folderInterface, folder, level + 1);
    }
}

async function main(args: string[])
{
    if (args.length < 1)
    {
        console.log(`Need at least app id (and optionally branch name) on command line`);
        return;
    }

    const appID = args[0];
    const branch = args[1];

    const client = new MendixPlatformClient();
    var workingCopy:OnlineWorkingCopy;

    const app = client.getApp(appID);
    
    var useBranch = branch;

    const repository = app.getRepository();
    const appName = "App-" + appID;
    
    if ((branch === undefined) || (branch === "") || (branch === "trunk") || (branch === "main"))
    {
        const repositoryInfo = await repository.getInfo();
        if (repositoryInfo.type === "svn")
            useBranch = "trunk";
        else
            useBranch = "main";
    }

    try
    {
        workingCopy = await app.createTemporaryWorkingCopy(useBranch);
    }
    catch (e)
    {
        console.log(`Failed to create new working copy for app ${appID}, ${appName}, branch ${useBranch}: ${e}`);
        return;
    }

    console.log(`Opening ${appID}, ${appName}`);

    const model = await workingCopy!.openModel();

    const moduleInterfaces = model.allModules();

    const navigationInterfaces = model.allNavigationDocuments();

    const projectSecurityInterfaces = model.allProjectSecurities();

    if (!fs.existsSync("Output"))
        fs.mkdirSync("Output");

    console.log("Load documents");

    for (var moduleInterface of moduleInterfaces)
    {
        console.log(`Module: ${moduleInterface.name}`);

        const domainModel = await moduleInterface.domainModel.load();

        fs.writeFileSync("Output/DM-" + moduleInterface.name + ".json", exportDocumentJSON(domainModel));
        fs.writeFileSync("Output/DM-" + moduleInterface.name + ".js", exportDocumentJS(domainModel, "DM$$" + moduleInterface.name));

        moduleOutput = 'import { domainmodels, projects, texts, pages, IStructure, datatypes, IAbstractUnit, JavaScriptSerializer } from "mendixmodelsdk";\n';

        for (var topDocument of moduleInterface.documents)
        {
            await processDocument(model, moduleInterface, topDocument, moduleInterface, 1);
        }

        for (var folder of moduleInterface.folders)
        {
            await processFolder(model, moduleInterface, folder, moduleInterface, 1);
        }

        fs.writeFileSync("Output/MOD-" + moduleInterface.name + ".js", moduleOutput);

        var moduleSecurity = await moduleInterface.moduleSecurity.load();

        fs.writeFileSync("Output/MSC-" + moduleInterface.name + ".json", exportDocumentJSON(moduleSecurity));
        fs.writeFileSync("Output/MSC-" + moduleInterface.name + ".js", exportDocumentJS(moduleSecurity, "MSC$$" + moduleInterface.name));
    }

    var navigationCount = -1;

    for (var navigationInterface of navigationInterfaces)
    {
        navigationCount++;

        console.log(`Opening navigation document ${navigationCount}`);

        var navigationDocument = await navigationInterface.load();

        fs.writeFileSync("Output/NAV-" + navigationCount + ".json", exportDocumentJSON(navigationDocument));
        fs.writeFileSync("Output/NAV-" + navigationCount + ".js", exportDocumentJS(navigationDocument, "NAV$$" + navigationCount));
    }

    var securityCount = -1;

    for (var projectSecurityInterface of projectSecurityInterfaces)
    {
        securityCount++;

        console.log(`Opening project security ${securityCount}`);
        
        var projectSecurity = await projectSecurityInterface.load();

        fs.writeFileSync("Output/PSC-" + securityCount + ".json", exportDocumentJSON(projectSecurity));
        fs.writeFileSync("Output/PSC-" + securityCount + ".js", exportDocumentJS(projectSecurity, "PSC$$" + securityCount));
    }

}