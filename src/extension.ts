import * as crypto from "node:crypto";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";

const filenameEndingLength = 5;
const imageAlt = "math";
const inlineMath = /^\$[\s\S]*\S+[\s\S]*\$$/;
const displayMath = /^\$\$[\s\S]*\S+[\s\S]*\$\$$/;

enum RenderEngine {
    MathJax
}

enum RenderStyle {
    Invalid,
    Inline,
    Display
}

let editor = vscode.window.activeTextEditor;

// Writes content to local file
const writeSVGFile = (filePath: string, fileContent: string): void => {
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) {
        fs.mkdir(dirPath, {recursive: true}, (error: any) => {
            if (error) {
                vscode.window.showErrorMessage(`Failed to create SVG folder at ${dirPath}.`).then(() => null);
                return;
            }
        });
    }
    fs.writeFile(filePath, fileContent, (error: any) => {
        if (error) {
            vscode.window.showErrorMessage(`Failed to create SVG file at ${filePath}.`).then(() => null);
        }
    });
};

// Renders equation with MathJax and write to local file
const renderMathJax = (equation: string, filePath: string, renderStyle: RenderStyle): void => {
    require("mathjax")
        .init({
            loader: {load: ["input/tex", "output/svg"]},
        })
        .then((MathJax: any) => {
            const renderedNode = MathJax.tex2svg(equation, {
                display: renderStyle === RenderStyle.Display,
            });
            const renderedSvg = MathJax.startup.adaptor.innerHTML(renderedNode);
            writeSVGFile(filePath, renderedSvg);
        })
        .catch((error: string) => {
            vscode.window.showErrorMessage(`Error: ${error}; Equation: ${equation}; Path: ${filePath}; Style: ${renderStyle}`).then(() => null);
        });
};

// Renders selected text in editor to SVG file
const render = (renderEngine: RenderEngine): void => {
    // Get selected text
    editor = vscode.window.activeTextEditor;
    const selection = editor?.document.getText(editor?.selection);
    const selectionStart = editor?.selection.start;
    const selectionEnd = editor?.selection.end;

    if (selection === undefined || selectionStart === undefined || selectionEnd === undefined) {
        vscode.window.showErrorMessage("Nothing selected.").then(() => null);
    } else {
        // Check number of dollar signs to determine render style ($$ == display, $ == inline, else invalid)
        let renderStyle = RenderStyle.Invalid;

        if (displayMath.test(selection)) {
            renderStyle = RenderStyle.Display;
        } else if (inlineMath.test(selection)) {
            renderStyle = RenderStyle.Inline;
        }

        if (renderStyle === RenderStyle.Invalid) {
            vscode.window.showErrorMessage("Not a valid equation, include leading and trailing dollar sign(s) as well.").then(() => null);
        } else {
            // Remove leading and trailing $ / $$
            const equation = (renderStyle === RenderStyle.Display)
                ? selection.slice(2, -2).trim()
                : selection.slice(1, -1).trim();

            // Name of generated file has two parts:
            // 1. relative path from project root (workspace) to current document
            const workspacePath = vscode.workspace.workspaceFolders ? vscode.workspace.workspaceFolders[0].uri.fsPath : "";
            const currentDocumentPath = editor?.document.uri.fsPath!;
            const filenameBeginning = path.relative(workspacePath, currentDocumentPath).replaceAll(path.sep, "-");
            // 2. random characters
            const randomString = crypto.randomBytes(filenameEndingLength).toString("hex");
            const filename = `${filenameBeginning}-${randomString}.svg`;
            const svgPath = path.join(workspacePath, "svg", filename);

            // Render to SVG file
            renderMathJax(equation, svgPath, renderStyle);

            // Comment out the selection and insert markdown image with path to generated SVG file
            const relativeSvgPath = path.relative(path.dirname(currentDocumentPath), svgPath);
            editor?.edit(editBuilder => {
                editBuilder.insert(selectionStart, "<!--");
                editBuilder.insert(selectionEnd, `-->\n![${imageAlt}](${relativeSvgPath})`);
            });
        }
    }
};

export function activate(context: vscode.ExtensionContext) {
    const renderMathJax = vscode.commands.registerCommand("math2mdimage.renderMathJax", () => {
        render(RenderEngine.MathJax);
    });

    context.subscriptions.push(renderMathJax);
}

export function deactivate() {
}
