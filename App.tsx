import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import MonacoEditor, { loader } from '@monaco-editor/react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { useDebounce } from './hooks/useDebounce';
import { generateCode } from './services/geminiService';
import type { GeneratedCode, LogEntry, LogType } from './types';
import { templates, Template } from './templates';
import * as prettier from 'prettier/standalone';
import prettierPluginHtml from 'prettier/plugins/html';
import prettierPluginCss from 'prettier/plugins/postcss';
import prettierPluginBabel from 'prettier/plugins/babel';
import prettierPluginEstree from 'prettier/plugins/estree';
import { HtmlIcon, CssIcon, JsIcon, SparklesIcon, ConsoleIcon, ClearIcon, PreviewIcon, ExpandIcon, CollapseIcon, SaveIcon, LoadIcon, ExportIcon, TemplateIcon, ThemeIcon } from './constants';
import { CommandPalette } from './CommandPalette';

const SettingsIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 6h9.75M10.5 6a1.5 1.5 0 11-3 0m3 0a1.5 1.5 0 10-3 0M3.75 6H7.5m3 12h9.75m-9.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-3.75 0H7.5m9-6h3.75m-3.75 0a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m-9.75 0h9.75" />
  </svg>
);

const FormatIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
  </svg>
);

const LayoutIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 4.5v15m6-15v15m-10.5-6h.008v.008H4.5v-.008zm0 3h.008v.008H4.5v-.008zm0 3h.008v.008H4.5v-.008zm3-6h.008v.008H7.5v-.008zm0 3h.008v.008H7.5v-.008zm0 3h.008v.008H7.5v-.008zm3-6h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm3-6h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008zm0 3h.008v.008h-.008v-.008z" />
  </svg>
);

const FullScreenIcon = (props) => (
  <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" {...props}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 9V4.5M9 9H4.5M9 9L3.75 3.75M9 15v4.5M9 15H4.5M9 15l-5.25 5.25M15 9h4.5M15 9V4.5M15 9l5.25-5.25M15 15h4.5M15 15v4.5M15 15l5.25 5.25" />
  </svg>
);



const initialHtml = `<!-- Welcome to AI CodePen! -->
<div class="container">
  <h1>Hello, World!</h1>
  <p>Start coding with auto-complete, or use the AI prompt to generate something new.</p>
  <button id="myButton">Click Me</button>
</div>`;
const initialCss = `body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
  color: #e2e8f0; /* slate-200 */
  display: flex;
  justify-content: center;
  align-items: center;
  height: 100%;
  margin: 0;
  background-color: #0f172a; /* slate-900 */
}

.container {
  text-align: center;
  background: #1e293b; /* slate-800 */
  padding: 2rem 4rem;
  border-radius: 1rem;
  box-shadow: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
}

h1 {
  font-size: 3rem;
  font-weight: 700;
  color: #38bdf8; /* sky-400 */
  margin-bottom: 0.5rem;
}

button {
  background-image: linear-gradient(to right, #3b82f6, #06b6d4);
  color: white;
  padding: 0.75rem 1.5rem;
  border-radius: 9999px;
  border: none;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
}

button:hover {
  transform: scale(1.05);
  box-shadow: 0 0 20px #06b6d4;
}`;
const initialJs = `const button = document.getElementById('myButton');

button.addEventListener('click', () => {
  console.log('Hello from JavaScript!', { a: 1, b: 'test' });
});

// Example of an error
// a.b.c = 10;
`;

const consoleInterceptorScript = `
  const customConsole = (method, ...args) => {
    window.parent.postMessage({
      source: 'iframe-console',
      type: method,
      message: args.map(arg => {
        if (arg instanceof Error) {
          return { __isError: true, message: arg.message, stack: arg.stack };
        }
        return arg;
      })
    }, '*');
  };

  ['log', 'warn', 'error', 'info', 'debug'].forEach(method => {
    const original = console[method];
    console[method] = (...args) => {
      original.apply(console, args);
      customConsole(method, ...args);
    };
  });

  window.addEventListener('error', e => {
    customConsole('error', e.error || e.message);
  });

  window.addEventListener('unhandledrejection', e => {
    customConsole('error', 'Unhandled Promise Rejection:', e.reason);
  });
`;

// Helper Components
const TemplatesMenu = ({ onSelectTemplate }) => {
    const [isOpen, setIsOpen] = useState(false);
    const menuRef = useRef(null);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (menuRef.current && !menuRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, [menuRef]);

    const handleSelect = (template: Template) => {
        onSelectTemplate(template);
        setIsOpen(false);
    };

    return (
        <div className="relative" ref={menuRef}>
            <button onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-1.5 p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 transition-colors" title="Load a Template">
                <TemplateIcon className="w-5 h-5" />
            </button>
            {isOpen && (
                <div className="absolute right-0 mt-2 w-48 bg-zinc-800 rounded-md shadow-lg z-50">
                    <ul className="py-1">
                        {templates.map(template => (
                            <li key={template.name}>
                                <a href="#" onClick={() => handleSelect(template)} className="block px-4 py-2 text-sm text-gray-300 hover:bg-zinc-700">
                                    {template.name}
                                </a>
                            </li>
                        ))}
                    </ul>
        </div>
      )}
    </div>
  );
};

const AIPromptHeader = ({ onGenerate, isLoading, onSave, onLoad, onExport, onSelectTemplate, onThemeChange, currentTheme, onOpenSettings, onToggleLayout }) => {
  const [prompt, setPrompt] = useState('');
  const handleSubmit = (e) => {
    e.preventDefault();
    onGenerate(prompt);
  };

  return (
    <header className="p-2 border-b border-zinc-800 flex-shrink-0 relative z-30">
      <div className="flex items-center gap-4 max-w-screen-xl mx-auto">
        <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-2">
          <div className="relative flex-1">
            <SparklesIcon className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-amber-500" />
            <input
              type="text"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the UI you want to create, e.g., 'a login form with a dark theme'"
              className="w-full bg-zinc-800 border border-zinc-700 rounded-full py-2 pl-10 pr-24 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          <button type="submit" disabled={isLoading} className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
            {isLoading ? 'Generating...' : 'Generate'}
          </button>
        </form>
        <div className="flex items-center gap-2">
          <button onClick={onSave} className="flex items-center gap-1.5 p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 transition-colors" title="Save Pen">
            <SaveIcon className="w-5 h-5" />
          </button>
          <button onClick={onLoad} className="flex items-center gap-1.5 p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 transition-colors" title="Load Pen">
            <LoadIcon className="w-5 h-5" />
          </button>
          <button onClick={onExport} className="flex items-center gap-1.5 p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 transition-colors" title="Export as ZIP">
            <ExportIcon className="w-5 h-5" />
          </button>
          <TemplatesMenu onSelectTemplate={onSelectTemplate} />
          <ThemeMenu onSelectTheme={onThemeChange} currentTheme={currentTheme} />
                    <button onClick={onToggleLayout} className="flex items-center gap-1.5 p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 transition-colors" title="Toggle Layout">
            <LayoutIcon className="w-5 h-5" />
          </button>
          <button onClick={onOpenSettings} className="flex items-center gap-1.5 p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 transition-colors" title="Settings">
            <SettingsIcon className="w-5 h-5" />
          </button>
        </div>
      </div>
    </header>
  );
};

const Editor = ({ language, displayName, icon, value, onChange, onToggleExpand, isExpanded, expandedEditor, theme, onFormat }) => (
  <div className={`flex flex-col bg-zinc-900/80 rounded-xl overflow-hidden border border-zinc-800 min-h-[150px] shadow-2xl shadow-black/30 backdrop-blur-sm transition-all duration-300 ${!expandedEditor ? 'flex-1' : isExpanded ? 'flex-[3]' : 'flex-[0.5]'}`}>
        <div className="flex items-center justify-between p-2 bg-zinc-900 border-b border-zinc-700">
      <div className="flex items-center">
        {icon}
        <h2 className="text-zinc-300 font-semibold">{displayName}</h2>
      </div>
      <div className="flex items-center gap-2">
        <button onClick={onFormat} className="text-zinc-400 hover:text-white transition-colors" title="Format Code">
          <FormatIcon className="w-5 h-5" />
        </button>
        <button onClick={onToggleExpand} className="text-zinc-400 hover:text-white transition-colors">
          {isExpanded ? <CollapseIcon className="w-5 h-5" /> : <ExpandIcon className="w-5 h-5" />}
        </button>
      </div>
    </div>
    <div className="flex-1 overflow-hidden">
      <MonacoEditor
        height="100%"
        language={language}
        theme={theme}
        value={value}
        onMount={(editor, monaco) => {
          monaco.editor.defineTheme('monokai', {
            base: 'vs-dark',
            inherit: true,
            rules: [
              { token: 'comment', foreground: '6a9955' },
              { token: 'keyword', foreground: 'c586c0' },
              { token: 'string', foreground: 'ce9178' },
              { token: 'number', foreground: 'b5cea8' },
              { token: 'tag', foreground: '569cd6' },
              { token: 'attribute.name', foreground: '9cdcfe' },
              { token: 'attribute.value', foreground: 'ce9178' },
            ],
            colors: {
              'editor.background': '#1e1e1e',
            }
          });

          monaco.editor.defineTheme('dribbble', {
            base: 'vs-dark',
            inherit: true,
            rules: [
              { token: 'comment', foreground: '7f848e' },
              { token: 'keyword', foreground: 'f973d0' },
              { token: 'string', foreground: '98c379' },
              { token: 'number', foreground: 'd19a66' },
              { token: 'tag', foreground: '61afef' },
              { token: 'attribute.name', foreground: '9cdcfe' },
              { token: 'attribute.value', foreground: '98c379' },
              { token: 'identifier', foreground: 'd8d4e7' },
            ],
            colors: {
              'editor.background': '#251e3f',
              'editor.foreground': '#d8d4e7',
              'editorLineNumber.foreground': '#636b7b',
              'editorCursor.foreground': '#f8f8f0',
              'editor.selectionBackground': '#44475a',
              'editor.lineHighlightBackground': '#2c2f40',
            }
          });

          if (language === 'html') {
            monaco.languages.registerCompletionItemProvider('html', {
              triggerCharacters: ['!'],
              provideCompletionItems: (model, position) => {
                const textUntilPosition = model.getValueInRange({
                  startLineNumber: position.lineNumber,
                  startColumn: 1,
                  endLineNumber: position.lineNumber,
                  endColumn: position.column,
                });

                const suggestions = [];

                if (textUntilPosition.endsWith('!')) {
                  suggestions.push({
                    label: '!',
                    kind: monaco.languages.CompletionItemKind.Snippet,
                    documentation: 'HTML5 boilerplate',
                    insertText: `<!DOCTYPE html>\n<html lang="en">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">\n  <title>Document</title>\n</head>\n<body>\n  $0\n</body>\n</html>`,
                    insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                    range: new monaco.Range(position.lineNumber, position.column - 1, position.lineNumber, position.column),
                  });
                }

                const word = model.getWordUntilPosition(position);
                const range = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);

                const tags = ['div', 'p', 'span', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'a', 'ul', 'li', 'table', 'tr', 'td', 'th', 'form', 'button', 'label', 'textarea', 'select', 'option'];
                const selfClosingTags = ['img', 'input', 'br', 'hr', 'meta', 'link'];

                const createSnippet = (tag, selfClosing = false) => ({
                  label: tag,
                  kind: monaco.languages.CompletionItemKind.Snippet,
                  documentation: `Create <${tag}> element`,
                  insertText: selfClosing ? `<${tag} $0>` : `<${tag}>\n\t$0\n</${tag}>`,
                  insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                  range: range,
                });

                tags.forEach(tag => {
                  if (tag.startsWith(word.word)) {
                    suggestions.push(createSnippet(tag));
                  }
                });

                selfClosingTags.forEach(tag => {
                  if (tag.startsWith(word.word)) {
                    suggestions.push(createSnippet(tag, true));
                  }
                });

                return { suggestions: suggestions.filter((s, i, a) => a.findIndex(t => t.label === s.label) === i) };
              },
            });
          }

          monaco.editor.setTheme(theme);
          editor.getAction('editor.action.formatDocument').run();

          editor.addAction({
            id: 'format-on-save',
            label: 'Format Document on Save',
            keybindings: [
              monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS,
            ],
            run: (ed) => {
              ed.getAction('editor.action.formatDocument').run();
            },
          });
        }}
        onChange={(val) => onChange(val || '')}
        options={{
          minimap: { enabled: false },
          fontSize: 14,
          wordWrap: 'off',
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          padding: { top: 10, bottom: 10 },
          formatOnMount: true,
        }}
      />
    </div>
  </div>
);

const ConsoleOutput = ({ logs, onClear }) => {
  const formatArg = (arg) => {
    if (typeof arg === 'object' && arg !== null) {
      if (arg.__isError) {
        return arg.stack || arg.message;
      }
      try { return JSON.stringify(arg, null, 2); } catch (e) { return '[Circular]'; }
    }
    return String(arg);
  };

  const logTypeClasses = {
    log: 'text-slate-300',
    error: 'text-red-400',
    warn: 'text-yellow-400',
    info: 'text-blue-400',
    debug: 'text-purple-400',
  };

  return (
    <div className="bg-slate-900 h-full flex flex-col">
      <div className="flex justify-between items-center p-2 border-b border-slate-700 flex-shrink-0">
        <p className="text-sm font-semibold text-slate-400">Console</p>
        <button onClick={onClear} title="Clear console" className="text-slate-400 hover:text-white transition-colors"><ClearIcon className="w-5 h-5" /></button>
      </div>
      <div className="font-mono text-sm p-2 overflow-y-auto flex-1">
        {logs.length === 0 && <p className="text-slate-500">No logs yet. Use console.log() in your JS code.</p>}
        {logs.map((log, index) => (
          <div key={index} className={`flex gap-2 items-start border-b border-slate-800 py-1 ${logTypeClasses[log.type]}`}>
            <span className="text-slate-500 select-none">{log.timestamp}</span>
            <div className="flex-1 whitespace-pre-wrap break-words">
              {log.message.map(formatArg).join(' ')}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const ThemeMenu = ({ onSelectTheme, currentTheme }) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const themes = [
    { name: 'Dark', value: 'vs-dark' },
    { name: 'Light', value: 'vs' },
    { name: 'Monokai', value: 'monokai' },
    { name: 'Dribbble', value: 'dribbble' },
  ];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [menuRef]);

  const handleSelect = (theme: { name: string, value: string }) => {
    onSelectTheme(theme.value);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button onClick={() => setIsOpen(!isOpen)} className="flex items-center gap-1.5 p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 transition-colors" title="Change Theme">
        <ThemeIcon className="w-5 h-5" />
      </button>
      {isOpen && (
        <div className="absolute right-0 mt-2 w-48 bg-zinc-800 rounded-md shadow-lg z-50">
          <ul className="py-1">
            {themes.map(theme => (
              <li key={theme.value}>
                <a href="#" onClick={(e) => { e.preventDefault(); handleSelect(theme); }} className={`block px-4 py-2 text-sm ${currentTheme === theme.value ? 'text-amber-500' : 'text-gray-300'} hover:bg-zinc-700`}>
                  {theme.name}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
};

const SettingsModal = ({ isOpen, onClose, cssLibs, jsLibs, onSave }) => {
  const [cssInput, setCssInput] = useState('');
  const [jsInput, setJsInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCssInput(cssLibs.join('\n'));
      setJsInput(jsLibs.join('\n'));
      setSearchTerm('');
      setSearchResults([]);
      setIsLoading(false);
    }
  }, [isOpen, cssLibs, jsLibs]);

  const handleSave = () => {
    const cssUrls = cssInput.split('\n').map(s => s.trim()).filter(Boolean);
    const jsUrls = jsInput.split('\n').map(s => s.trim()).filter(Boolean);
    onSave(cssUrls, jsUrls);
    onClose();
  };

  const handleSearch = async () => {
    if (!searchTerm) return;
    setIsLoading(true);
    try {
      const response = await fetch(`https://api.cdnjs.com/libraries?search=${searchTerm}&fields=version,latest`);
      const data = await response.json();
      setSearchResults(data.results || []);
    } catch (error) {
      console.error('Failed to search for libraries:', error);
      setSearchResults([]);
    }
    setIsLoading(false);
  };

  const handleAddLibrary = (url: string) => {
    if (url.endsWith('.css')) {
      setCssInput(prev => `${prev}\n${url}`.trim());
    } else if (url.endsWith('.js')) {
      setJsInput(prev => `${prev}\n${url}`.trim());
    }
    setSearchTerm('');
    setSearchResults([]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-zinc-900 rounded-2xl shadow-2xl w-full max-w-2xl border border-zinc-800 p-8" onClick={e => e.stopPropagation()}>
        <h2 className="text-2xl font-bold text-amber-400 mb-6">External Libraries</h2>
        
        <div className="mb-6">
            <h3 className="font-semibold mb-2 text-zinc-300">Find on cdnjs.com</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                placeholder="e.g., bootstrap"
                className="flex-grow p-2 bg-zinc-800 border border-zinc-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
              <button onClick={handleSearch} disabled={isLoading || !searchTerm} className="px-6 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 disabled:bg-zinc-600 transition-colors font-semibold">
                {isLoading ? '...' : 'Search'}
              </button>
            </div>
            {searchResults.length > 0 && (
              <ul className="mt-2 bg-zinc-800 border border-zinc-700 rounded-lg max-h-48 overflow-y-auto">
                {searchResults.map((lib: any) => (
                  <li key={lib.name} className="p-3 hover:bg-zinc-700 cursor-pointer flex justify-between items-center text-sm" onClick={() => handleAddLibrary(lib.latest)}>
                    <span>{lib.name}</span>
                    <span className="text-xs text-zinc-400">v{lib.version}</span>
                  </li>
                ))}
              </ul>
            )}
        </div>

        <div className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">CSS Libraries (one per line)</label>
            <textarea
              value={cssInput}
              onChange={e => setCssInput(e.target.value)}
              placeholder="https://.../library.css"
              className="w-full h-24 bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono text-sm"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-zinc-300 mb-2">JavaScript Libraries (one per line)</label>
            <textarea
              value={jsInput}
              onChange={e => setJsInput(e.target.value)}
              placeholder="https://.../library.js"
              className="w-full h-24 bg-zinc-800 border border-zinc-700 rounded-lg p-3 text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-amber-500 font-mono text-sm"
            />
          </div>
        </div>
        <div className="mt-8 flex justify-end gap-4">
          <button onClick={onClose} className="px-6 py-2 rounded-full bg-zinc-700 hover:bg-zinc-600 transition-colors">Cancel</button>
          <button onClick={handleSave} className="px-6 py-2 rounded-full bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 transition-colors font-semibold">Save Changes</button>
        </div>
      </div>
    </div>
  );
};

export default function App() {
  const [htmlCode, setHtmlCode] = useState(() => localStorage.getItem('ai-codepen-html') || initialHtml);
  const [cssCode, setCssCode] = useState(() => localStorage.getItem('ai-codepen-css') || initialCss);
  const [jsCode, setJsCode] = useState(() => localStorage.getItem('ai-codepen-js') || initialJs);
  const [error, setError] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [paneHeight, setPaneHeight] = useState(window.innerHeight * 0.55);
  const isDragging = useRef(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<'preview' | 'console'>('preview');
  const [isEditorReady, setIsEditorReady] = useState(false);
  const [expandedEditor, setExpandedEditor] = useState<string | null>(null);
  const [editorTheme, setEditorTheme] = useState(() => {
    return localStorage.getItem('ai-codepen-theme') || 'vs-dark';
  });
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [cssLibraries, setCssLibraries] = useState<string[]>(() => JSON.parse(localStorage.getItem('ai-codepen-css-libs') || '[]'));
    const [jsLibraries, setJsLibraries] = useState<string[]>(() => JSON.parse(localStorage.getItem('ai-codepen-js-libs') || '[]'));
              const [layout, setLayout] = useState<'horizontal' | 'vertical' | 'main'>(
      () => (localStorage.getItem('ai-codepen-layout') as 'horizontal' | 'vertical' | 'main') || 'horizontal'
    );
        const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  const handleToggleLayout = () => {
    setLayout(prev => {
      if (prev === 'horizontal') return 'vertical';
      if (prev === 'vertical') return 'main';
      return 'horizontal';
    });
  };

  const debouncedHtml = useDebounce(htmlCode, 500);
  const debouncedCss = useDebounce(cssCode, 500);
  const debouncedJs = useDebounce(jsCode, 500);

  useEffect(() => { localStorage.setItem('ai-codepen-html', debouncedHtml); }, [debouncedHtml]);
  useEffect(() => { localStorage.setItem('ai-codepen-css', debouncedCss); }, [debouncedCss]);
  useEffect(() => { localStorage.setItem('ai-codepen-js', debouncedJs); }, [debouncedJs]);

  useEffect(() => { localStorage.setItem('ai-codepen-css-libs', JSON.stringify(cssLibraries)); }, [cssLibraries]);
    useEffect(() => { localStorage.setItem('ai-codepen-js-libs', JSON.stringify(jsLibraries)); }, [jsLibraries]);
  useEffect(() => { localStorage.setItem('ai-codepen-layout', layout); }, [layout]);

  useEffect(() => {
    const initMonaco = async () => {
      try {
        loader.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.45.0/min/vs' } });
        await loader.init();
        setIsEditorReady(true);
      } catch (error) {
        console.error('Failed to initialize Monaco editor', error);
        setError('Could not load code editor. Please check your internet connection and try again.');
      }
    };

    initMonaco();
  }, []);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data && event.data.source === 'iframe-console') {
        const { type, message } = event.data;
        setLogs(prev => [...prev, { type, message, timestamp: new Date().toLocaleTimeString() }]);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const srcDoc = useMemo(() => {
    const cssLibs = cssLibraries.map(url => `<link rel="stylesheet" href="${url}">`).join('\n');
    const jsLibs = jsLibraries.map(url => `<script src="${url}"></script>`).join('\n');

    return `
      <html>
        <head>
          ${cssLibs}
          <style>${debouncedCss}</style>
          <script>${consoleInterceptorScript}</script>
        </head>
        <body>
          ${debouncedHtml}
          ${jsLibs}
          <script>${debouncedJs}</script>
        </body>
      </html>
    `;
  }, [debouncedHtml, debouncedCss, debouncedJs, cssLibraries, jsLibraries]);

  const handleGenerateCode = async (prompt) => {
    setIsGenerating(true);
    setError('');
    setLogs([]);
    try {
      const result = await generateCode(prompt);
      setHtmlCode(result.html);
      setCssCode(result.css);
      setJsCode(result.javascript);
    } catch (err) {
      setError(err.message || 'An error occurred.');
      setTimeout(() => setError(''), 5000);
    } finally {
      setIsGenerating(false);
    }
  };

    const handleMouseDown = useCallback((e: React.MouseEvent) => { isDragging.current = true; e.preventDefault(); }, []);
  const handleMouseUp = useCallback(() => { isDragging.current = false; }, []);
    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isDragging.current) return;

    if (layout === 'horizontal') {
      setPaneHeight(prev => {
        const newHeight = e.clientY;
        const minHeight = 150;
        const maxHeight = window.innerHeight - 200;
        return Math.max(minHeight, Math.min(newHeight, maxHeight));
      });
    } else {
      setPaneHeight(prev => {
        const newWidth = e.clientX;
        const minWidth = 200;
        const maxWidth = window.innerWidth - 200;
        return Math.max(minWidth, Math.min(newWidth, maxWidth));
      });
    }
  }, []);

  useEffect(() => {
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const handleToggleExpand = (editorName: string) => {
    setExpandedEditor(prev => (prev === editorName ? null : editorName));
  };

  const handleSave = () => {
    const projectData = {
      html: htmlCode,
      css: cssCode,
      js: jsCode,
      cssLibraries,
      jsLibraries,
      layout,
      theme: editorTheme,
    };

    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'codepen-project.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setError('Project exported as JSON!');
    setTimeout(() => setError(''), 3000);
  };

  const handleLoad = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.onchange = (e) => {
      const target = e.target as HTMLInputElement;
      const file = target.files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const projectData = JSON.parse(event.target?.result as string);
          const { html, css, js, cssLibraries, jsLibraries, layout, theme } = projectData;

          if (typeof html === 'string') setHtmlCode(html);
          if (typeof css === 'string') setCssCode(css);
          if (typeof js === 'string') setJsCode(js);
          if (Array.isArray(cssLibraries)) setCssLibraries(cssLibraries);
          if (Array.isArray(jsLibraries)) setJsLibraries(jsLibraries);
          if (['horizontal', 'vertical'].includes(layout)) setLayout(layout);
          if (['vs-dark', 'light'].includes(theme)) setEditorTheme(theme);

          setError('Project loaded successfully!');
          setTimeout(() => setError(''), 3000);
        } catch (err) {
          console.error("Failed to parse project file", err);
          setError('Failed to load project: Invalid file format.');
          setTimeout(() => setError(''), 3000);
        }
      };
      reader.readAsText(file);
    };
    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  };

  const handleLoadTemplate = (template: Template) => {
    setHtmlCode(template.html);
    setCssCode(template.css);
    setJsCode(template.js);
    alert(`Template "${template.name}" loaded successfully!`);
  };

  const handleExportZip = () => {
    const zip = new JSZip();
    zip.file("index.html", htmlCode);
    zip.file("style.css", cssCode);
    zip.file("script.js", jsCode);

    zip.generateAsync({ type: "blob" }).then(content => {
      saveAs(content, "ai-codepen-export.zip");
    });
  };

  const handleThemeChange = (theme: string) => {
    setEditorTheme(theme);
    localStorage.setItem('ai-codepen-theme', theme);
  };

  const handleSaveLibraries = (cssUrls: string[], jsUrls: string[]) => {
    setCssLibraries(cssUrls);
    setJsLibraries(jsUrls);
  };

    const handleFormatCode = async (language: 'html' | 'css' | 'javascript') => {
    try {
      let codeToFormat = '';
      let setter: React.Dispatch<React.SetStateAction<string>>;
      let parser = '';

      switch (language) {
        case 'html':
          codeToFormat = htmlCode;
          setter = setHtmlCode;
          parser = 'html';
          break;
        case 'css':
          codeToFormat = cssCode;
          setter = setCssCode;
          parser = 'css';
          break;
        case 'javascript':
          codeToFormat = jsCode;
          setter = setJsCode;
          parser = 'babel';
          break;
      }

      const formattedCode = await prettier.format(codeToFormat, {
        parser: parser,
        plugins: [prettierPluginHtml, prettierPluginCss, prettierPluginBabel, prettierPluginEstree],
        semi: true,
        singleQuote: true,
      });

      setter(formattedCode);

    } catch (error) {
      console.error('Failed to format code:', error);
      setError(`Failed to format ${language} code.`);
      setTimeout(() => setError(''), 3000);
    }
  };

  

    

  

    const handleOpenInNewTab = () => {
    const blob = new Blob([srcDoc], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    URL.revokeObjectURL(url);
  };

  const commands = [
    {
      heading: 'General',
      items: [
        { id: 'save', label: 'Save Project', action: handleSave, icon: <SaveIcon className="w-4 h-4 mr-2" /> },
        { id: 'load', label: 'Load Project', action: handleLoad, icon: <LoadIcon className="w-4 h-4 mr-2" /> },
        { id: 'export', label: 'Export as ZIP', action: handleExportZip, icon: <ExportIcon className="w-4 h-4 mr-2" /> },
        { id: 'settings', label: 'Open Settings', action: () => setIsSettingsOpen(true), icon: <SettingsIcon className="w-4 h-4 mr-2" /> },
        { id: 'new-tab', label: 'Open Preview in New Tab', action: handleOpenInNewTab, icon: <FullScreenIcon className="w-4 h-4 mr-2" /> },
      ],
    },
    {
      heading: 'Editor',
      items: [
        { id: 'format-html', label: 'Format HTML', action: () => handleFormatCode('html'), icon: <FormatIcon className="w-4 h-4 mr-2" /> },
        { id: 'format-css', label: 'Format CSS', action: () => handleFormatCode('css'), icon: <FormatIcon className="w-4 h-4 mr-2" /> },
        { id: 'format-js', label: 'Format JavaScript', action: () => handleFormatCode('javascript'), icon: <FormatIcon className="w-4 h-4 mr-2" /> },
      ],
    },
    {
      heading: 'View',
      items: [
                { id: 'toggle-layout', label: 'Toggle Layout', action: handleToggleLayout, icon: <LayoutIcon className="w-4 h-4 mr-2" /> },
        { id: 'toggle-theme', label: 'Toggle Theme', action: handleThemeChange, icon: <ThemeIcon className="w-4 h-4 mr-2" /> },
        { id: 'clear-console', label: 'Clear Console', action: () => setLogs([]), icon: <ClearIcon className="w-4 h-4 mr-2" /> },
      ],
    },
  ];

  const TabButton = ({ isActive, onClick, children }) => (
    <button onClick={onClick} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-all ${isActive ? 'text-amber-400 border-amber-400' : 'text-zinc-400 border-transparent hover:text-white hover:bg-zinc-700/50'}`}>
      {children}
    </button>
  );

  return (
        <div className="flex flex-col h-screen text-white overflow-hidden bg-zinc-950" style={{ background: 'radial-gradient(ellipse at top, #1c1917, #0c0a09)' }}>
      <CommandPalette open={isCommandPaletteOpen} setOpen={setIsCommandPaletteOpen} commands={commands} />
      <SettingsModal isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} cssLibs={cssLibraries} jsLibs={jsLibraries} onSave={handleSaveLibraries} />
            <AIPromptHeader onGenerate={handleGenerateCode} isLoading={isGenerating} onSave={handleSave} onLoad={handleLoad} onExport={handleExportZip} onSelectTemplate={handleLoadTemplate} onThemeChange={handleThemeChange} currentTheme={editorTheme} onOpenSettings={() => setIsSettingsOpen(true)} onToggleLayout={handleToggleLayout} />
      {error && <div className="bg-red-500 text-white p-2 text-center flex-shrink-0">{error}</div>}
                        <div className={`flex-1 flex ${layout === 'vertical' ? 'flex-row' : 'flex-col'}`} style={{ height: `calc(100vh - 68px - ${error ? '40px' : '0px'})` }}>
                <div className="flex-grow-0" style={{ [layout === 'vertical' ? 'width' : 'height']: `${paneHeight}px` }}>
                    {layout === 'main' ? (
                        <div className="p-4 h-full flex gap-4 flex-row">
                            <div className="flex flex-col gap-4 w-1/2">
                                {isEditorReady ? <Editor language="html" displayName="HTML" icon={<HtmlIcon />} value={htmlCode} onChange={setHtmlCode} onToggleExpand={() => handleToggleExpand('html')} isExpanded={expandedEditor === 'html'} expandedEditor={expandedEditor} theme={editorTheme} onFormat={() => handleFormatCode('html')} /> : <div className="flex-1 flex items-center justify-center bg-slate-800 rounded-lg border border-slate-700">Initializing Editor...</div>}
                                {isEditorReady ? <Editor language="css" displayName="CSS" icon={<CssIcon />} value={cssCode} onChange={setCssCode} onToggleExpand={() => handleToggleExpand('css')} isExpanded={expandedEditor === 'css'} expandedEditor={expandedEditor} theme={editorTheme} onFormat={() => handleFormatCode('css')} /> : <div className="flex-1 flex items-center justify-center bg-slate-800 rounded-lg border border-slate-700">Initializing Editor...</div>}
                            </div>
                            <div className="w-1/2 flex flex-col">
                                {isEditorReady ? <Editor language="javascript" displayName="JavaScript" icon={<JsIcon />} value={jsCode} onChange={setJsCode} onToggleExpand={() => handleToggleExpand('javascript')} isExpanded={expandedEditor === 'javascript'} expandedEditor={expandedEditor} theme={editorTheme} onFormat={() => handleFormatCode('javascript')} /> : <div className="flex-1 flex items-center justify-center bg-slate-800 rounded-lg border border-slate-700">Initializing Editor...</div>}
                            </div>
                        </div>
                    ) : (
                        <div className={`p-4 h-full flex gap-4 ${layout === 'horizontal' ? 'flex-row' : 'flex-col'}`}>
                            {isEditorReady ? <Editor language="html" displayName="HTML" icon={<HtmlIcon />} value={htmlCode} onChange={setHtmlCode} onToggleExpand={() => handleToggleExpand('html')} isExpanded={expandedEditor === 'html'} expandedEditor={expandedEditor} theme={editorTheme} onFormat={() => handleFormatCode('html')} /> : <div className="flex-1 flex items-center justify-center bg-slate-800 rounded-lg border border-slate-700">Initializing Editor...</div>}
                            {isEditorReady ? <Editor language="css" displayName="CSS" icon={<CssIcon />} value={cssCode} onChange={setCssCode} onToggleExpand={() => handleToggleExpand('css')} isExpanded={expandedEditor === 'css'} expandedEditor={expandedEditor} theme={editorTheme} onFormat={() => handleFormatCode('css')} /> : <div className="flex-1 flex items-center justify-center bg-slate-800 rounded-lg border border-slate-700">Initializing Editor...</div>}
                            {isEditorReady ? <Editor language="javascript" displayName="JavaScript" icon={<JsIcon />} value={jsCode} onChange={setJsCode} onToggleExpand={() => handleToggleExpand('javascript')} isExpanded={expandedEditor === 'javascript'} expandedEditor={expandedEditor} theme={editorTheme} onFormat={() => handleFormatCode('javascript')} /> : <div className="flex-1 flex items-center justify-center bg-slate-800 rounded-lg border border-slate-700">Initializing Editor...</div>}
                        </div>
                    )}
                </div>

                                                                        <div 
                            onMouseDown={handleMouseDown} 
                            className={`group flex-shrink-0 ${layout === 'vertical' ? 'w-2 cursor-col-resize' : 'h-2 cursor-row-resize'} bg-zinc-900 hover:bg-zinc-800 transition-all duration-200 flex items-center justify-center`}>
                            <div className="w-1 h-8 bg-zinc-700 rounded-full group-hover:bg-amber-500 transition-colors duration-200" style={{ transform: layout === 'vertical' ? 'rotate(90deg)' : 'none' }}></div>
                        </div>

                <div className={`flex-1 flex flex-col min-h-0 ${layout === 'vertical' ? 'border-l border-zinc-800' : ''}`}>
                        <div className="flex-shrink-0 bg-zinc-900 border-t border-b border-zinc-800 flex items-center justify-between">
                <div className="flex">
                    <TabButton isActive={activeTab === 'preview'} onClick={() => setActiveTab('preview')}><PreviewIcon className="w-5 h-5"/> Vista Previa</TabButton>
                    <TabButton isActive={activeTab === 'console'} onClick={() => setActiveTab('console')}><ConsoleIcon className="w-5 h-5"/> Consola <span className="text-xs bg-slate-700 rounded-full px-1.5 py-0.5">{logs.length}</span></TabButton>
                </div>
                 <div className="flex items-center gap-2 mr-2">
                    {activeTab === 'preview' && (
                        <button onClick={handleOpenInNewTab} title="Open in New Tab" className="text-slate-400 hover:text-white transition-colors">
                            <FullScreenIcon className="w-5 h-5" />
                        </button>
                    )}
                    {activeTab === 'console' && <button onClick={() => setLogs([])} title="Clear console" className="text-slate-400 hover:text-white transition-colors"><ClearIcon className="w-5 h-5"/></button>}
                 </div>
            </div>
            <div className="flex-1 bg-white relative">
              {activeTab === 'preview' ? (
                <iframe srcDoc={srcDoc} title="output" sandbox="allow-scripts" frameBorder="0" width="100%" height="100%" className="bg-white"/>
              ) : (
                <ConsoleOutput logs={logs} onClear={() => setLogs([])} />
              )}
            </div>
        </div>
      </div>
    </div>
  );
}