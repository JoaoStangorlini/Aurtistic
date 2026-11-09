const fs = require('fs');
const path = './src/app/configuracoes-avancadas/AdvancedConfigClient.tsx';

let code = fs.readFileSync(path, 'utf8');

// The right side div: 
//         {/* Lado Direito: Feedback Form */}
//         <div className="bg-[#1A1A1A] border border-[#2D2D2D] rounded-xl p-6 shadow-xl h-fit">...</div>

const startMarker = '{/* Lado Direito: Feedback Form */}';
const endMarkerIndex = code.indexOf('</div>', code.indexOf('</div>', code.indexOf('</div>', code.indexOf(startMarker))) + 1);
// It's safer to just split and slice. Actually, since the right side is the entire second column, I can just remove the CSS grid and the second column entirely.

code = code.replace(/<div className="grid grid-cols-1 lg:grid-cols-2 gap-8">/g, '<div className="max-w-2xl mx-auto">');

// We need to cut out the feedback states too.
code = code.replace(/  \/\/ Feedback State[\s\S]*?const \[feedbackMsg, setFeedbackMsg\] = useState\(''\);/, '');
code = code.replace(/  const handleSendFeedback = async \(\) => {[\s\S]*?  };/m, '');

// And the JSX part:
const rightSideStart = code.indexOf('{/* Lado Direito: Feedback Form */}');
if (rightSideStart !== -1) {
  // Find the closing div of the grid wrapper which is the </div> before </div> </div> at the end.
  // We'll just regex replace from the marker up to the last </div>
  const rightSideRegex = /\{\/\* Lado Direito: Feedback Form \*\/\}[\s\S]*?(?=      <\/div>\n    <\/div>\n  \);\n\})/m;
  code = code.replace(rightSideRegex, '');
}

fs.writeFileSync(path, code);
console.log('AdvancedConfigClient updated.');
