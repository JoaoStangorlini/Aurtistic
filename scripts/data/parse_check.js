const fs = require('fs');
const ts = require('typescript');
const code = fs.readFileSync('src/components/dashboard/TasksView.tsx', 'utf8');
const sf = ts.createSourceFile('TasksView.tsx', code, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
function checkNode(node) {
  if (node.kind === ts.SyntaxKind.JsxElement) {
    const opening = node.openingElement;
    const closing = node.closingElement;
    if (opening.tagName.getText() !== closing.tagName.getText()) {
      console.log('Mismatch at', opening.getText());
    }
  }
  ts.forEachChild(node, checkNode);
}
checkNode(sf);
const diag = sf.parseDiagnostics;
if (diag.length > 0) {
  console.log('Diagnostics:', diag.map(d => d.messageText));
} else {
  console.log('No parse diagnostics found.');
}
