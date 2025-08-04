import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import MonacoEditor, { loader } from '@monaco-editor/react';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { useDebounce } from './hooks/useDebounce';
import { generateCode } from './services/geminiService';
import type { GeneratedCode, LogEntry, LogType } from './types';
import { templates, Template } from './templates';
import { HtmlIcon, CssIcon, JsIcon, SparklesIcon, ConsoleIcon, ClearIcon, PreviewIcon, ExpandIcon, CollapseIcon, SaveIcon, LoadIcon, ExportIcon, TemplateIcon, ThemeIcon } from './constants';



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

const AIPromptHeader = ({ onGenerate, isLoading, onSave, onLoad, onExport, onSelectTemplate, onThemeChange, currentTheme }) => {
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
                </div>
            </div>
        </header>
    );
};

const Editor = ({ language, displayName, icon, value, onChange, onToggleExpand, isExpanded, expandedEditor, theme }) => (
            <div className={`flex flex-col bg-zinc-900/80 rounded-xl overflow-hidden border border-zinc-800 min-h-[150px] shadow-2xl shadow-black/30 backdrop-blur-sm transition-all duration-300 ${!expandedEditor ? 'flex-1' : isExpanded ? 'flex-[3]' : 'flex-[0.5]'}`}>
            <div className="flex items-center justify-between p-2 bg-zinc-900 border-b border-zinc-700">
      <div className="flex items-center">
        {icon}
        <h2 className="text-zinc-300 font-semibold">{displayName}</h2>
      </div>
      <button onClick={onToggleExpand} className="text-zinc-400 hover:text-white transition-colors">
        {isExpanded ? <CollapseIcon className="w-5 h-5" /> : <ExpandIcon className="w-5 h-5" />}
      </button>
    </div>
    <div className="flex-1">
      <MonacoEditor
        height="100%"
        language={language}
        theme={theme}
        value={value}
                onMount={(editor, monaco) => {
          // Define and set a custom Monokai theme
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

          // Set initial theme
          monaco.editor.setTheme(theme);
          editor.getAction('editor.action.formatDocument').run();

          // Add format on save action
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
}

const ThemeMenu = ({ onSelectTheme, currentTheme }: { onSelectTheme: (theme: string) => void, currentTheme: string }) => {
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

export default function App() {
  const [htmlCode, setHtmlCode] = useState(initialHtml);
  const [cssCode, setCssCode] = useState(initialCss);
  const [jsCode, setJsCode] = useState(initialJs);
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

  const debouncedHtml = useDebounce(htmlCode, 500);
  const debouncedCss = useDebounce(cssCode, 500);
    const debouncedJs = useDebounce(jsCode, 500);

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

  const srcDoc = useMemo(() => `
      <html>
        <head>
          <style>${debouncedCss}</style>
          <script>${consoleInterceptorScript}</script>
        </head>
        <body>
          ${debouncedHtml}
          <script>${debouncedJs}</script>
        </body>
      </html>
  `, [debouncedHtml, debouncedCss, debouncedJs]);

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

  const handleMouseDown = useCallback((e) => { isDragging.current = true; e.preventDefault(); }, []);
  const handleMouseUp = useCallback(() => { isDragging.current = false; }, []);
  const handleMouseMove = useCallback((e) => {
    if (!isDragging.current) return;
    setPaneHeight(prev => {
        const newHeight = e.clientY;
        const minHeight = 150;
        const maxHeight = window.innerHeight - 200;
        return Math.max(minHeight, Math.min(newHeight, maxHeight));
    });
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
    const penData = JSON.stringify({ htmlCode, cssCode, jsCode });
    localStorage.setItem('ai-codepen-data', penData);
    alert('Pen saved successfully!'); // A simple confirmation
  };

  const handleLoad = () => {
    const savedData = localStorage.getItem('ai-codepen-data');
    if (savedData) {
      const { htmlCode, cssCode, jsCode } = JSON.parse(savedData);
      setHtmlCode(htmlCode);
      setCssCode(cssCode);
      setJsCode(jsCode);
      alert('Pen loaded successfully!');
    } else {
      alert('No saved pen found.');
    }
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

  // Load saved code on initial render
  useEffect(() => {
    const savedData = localStorage.getItem('ai-codepen-data');
    if (savedData) {
      const { htmlCode, cssCode, jsCode } = JSON.parse(savedData);
      setHtmlCode(htmlCode);
      setCssCode(cssCode);
      setJsCode(jsCode);
    }
  }, []);

  const TabButton = ({ isActive, onClick, children }) => (
          <button onClick={onClick} className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-all ${isActive ? 'text-amber-400 border-amber-400' : 'text-zinc-400 border-transparent hover:text-white hover:bg-zinc-700/50'}`}>
         {children}
     </button>
  );

  return (
            <div className="flex flex-col h-screen text-white overflow-hidden bg-zinc-950" style={{ background: 'radial-gradient(ellipse at top, #1c1917, #0c0a09)' }}>
            <AIPromptHeader onGenerate={handleGenerateCode} isLoading={isGenerating} onSave={handleSave} onLoad={handleLoad} onExport={handleExportZip} onSelectTemplate={handleLoadTemplate} onThemeChange={handleThemeChange} currentTheme={editorTheme} />
      {error && <div className="bg-red-500 text-white p-2 text-center flex-shrink-0">{error}</div>}
      
      <div className="flex-1 flex flex-col" style={{ height: `calc(100vh - 68px - ${error ? '40px' : '0px'})` }}>
        <div className="flex-grow-0" style={{ height: `${paneHeight}px` }}>
            <div className="p-4 h-full flex gap-4">
                                {isEditorReady ? (
                                                                        <Editor language="html" displayName="HTML" icon={<HtmlIcon />} value={htmlCode} onChange={setHtmlCode} onToggleExpand={() => handleToggleExpand('html')} isExpanded={expandedEditor === 'html'} expandedEditor={expandedEditor} theme={editorTheme} />
                ) : (
                  <div className="flex-1 flex items-center justify-center bg-slate-800 rounded-lg border border-slate-700">Initializing Editor...</div>
                )}
                                {isEditorReady ? (
                                                                        <Editor language="css" displayName="CSS" icon={<CssIcon />} value={cssCode} onChange={setCssCode} onToggleExpand={() => handleToggleExpand('css')} isExpanded={expandedEditor === 'css'} expandedEditor={expandedEditor} theme={editorTheme} />
                ) : (
                  <div className="flex-1 flex items-center justify-center bg-slate-800 rounded-lg border border-slate-700">Initializing Editor...</div>
                )}
                                {isEditorReady ? (
                                                                        <Editor language="javascript" displayName="JavaScript" icon={<JsIcon />} value={jsCode} onChange={setJsCode} onToggleExpand={() => handleToggleExpand('javascript')} isExpanded={expandedEditor === 'javascript'} expandedEditor={expandedEditor} theme={editorTheme} />
                ) : (
                  <div className="flex-1 flex items-center justify-center bg-slate-800 rounded-lg border border-slate-700">Initializing Editor...</div>
                )}
            </div>
        </div>

                <div onMouseDown={handleMouseDown} className="h-2 bg-zinc-900 hover:bg-gradient-to-r from-amber-500 to-orange-600 cursor-row-resize transition-colors flex-shrink-0"/>

        <div className="flex-1 flex flex-col min-h-0">
                        <div className="flex-shrink-0 bg-zinc-900 border-t border-b border-zinc-800 flex items-center justify-between">
                <div className="flex">
                    <TabButton isActive={activeTab === 'preview'} onClick={() => setActiveTab('preview')}><PreviewIcon className="w-5 h-5"/> Vista Previa</TabButton>
                    <TabButton isActive={activeTab === 'console'} onClick={() => setActiveTab('console')}><ConsoleIcon className="w-5 h-5"/> Consola <span className="text-xs bg-slate-700 rounded-full px-1.5 py-0.5">{logs.length}</span></TabButton>
                </div>
                 {activeTab === 'console' && <button onClick={() => setLogs([])} className="mr-2 text-slate-400 hover:text-white transition-colors"><ClearIcon className="w-5 h-5"/></button>}
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