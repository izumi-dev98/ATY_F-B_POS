import { useState, useRef, useEffect } from 'react';
import { chatWithAI } from '../lib/anthropic';
import Swal from 'sweetalert2';

const STORAGE_KEY = 'ai_chat_history';

export default function AIChat() {
  // Load history from localStorage on mount
  const [messages, setMessages] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.length > 0) return parsed;
      } catch (e) {
        console.error('Failed to load chat history:', e);
      }
    }
    return [{
      role: 'assistant',
      content: 'Hello! I\'m your AI assistant with access to ALL your database.\n\nI can help you with:\n• Purchase Group (purchases, suppliers, outstanding payments)\n• Discount configurations\n• History & Orders\n• All Reports data\n• Categories\n• Dashboard metrics\n\nWhat would you like to know?',
      timestamp: new Date().toISOString()
    }];
  });

  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [conversationHistory, setConversationHistory] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY + '_conversation');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        return [];
      }
    }
    return [];
  });

  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Save to localStorage whenever messages change
  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
  }, [messages]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY + '_conversation', JSON.stringify(conversationHistory));
  }, [conversationHistory]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!inputValue.trim() || isLoading) return;

    const userMessage = inputValue.trim();
    setInputValue('');
    setIsLoading(true);

    // Add user message to chat
    const newUserMessage = {
      role: 'user',
      content: userMessage,
      timestamp: new Date().toISOString()
    };
    setMessages(prev => [...prev, newUserMessage]);

    // Call AI
    const result = await chatWithAI(userMessage, conversationHistory);

    if (result.success) {
      const aiMessage = {
        role: 'assistant',
        content: result.response,
        timestamp: new Date().toISOString()
      };
      setMessages(prev => [...prev, aiMessage]);
      setConversationHistory(prev => [
        ...prev,
        { role: 'user', content: userMessage },
        { role: 'assistant', content: result.response }
      ]);
    } else {
      Swal.fire('Error', result.error, 'error');
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
        timestamp: new Date().toISOString(),
        isError: true
      }]);
    }

    setIsLoading(false);
    inputRef.current?.focus();
  };

  const clearChat = async () => {
    const result = await Swal.fire({
      title: 'Clear Chat History?',
      text: 'This will delete all conversation history from local storage.',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, clear it',
      cancelButtonText: 'Cancel'
    });

    if (result.isConfirmed) {
      setMessages([{
        role: 'assistant',
        content: 'Hello! I\'m your AI assistant with access to ALL your database.\n\nI can help you with:\n• Purchase Group (purchases, suppliers, outstanding payments)\n• Discount configurations\n• History & Orders\n• All Reports data\n• Categories\n• Dashboard metrics\n\nWhat would you like to know?',
        timestamp: new Date().toISOString()
      }]);
      setConversationHistory([]);
      localStorage.removeItem(STORAGE_KEY);
      localStorage.removeItem(STORAGE_KEY + '_conversation');
    }
  };

  const formatDateTime = (timestamp) => {
    const date = new Date(timestamp);
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const formatMessage = (content) => {
    // Convert markdown-style formatting to HTML-like display
    return content
      .split('\n')
      .map((line, i) => {
        // Bold text
        line = line.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        // Bullet points
        if (line.trim().startsWith('•') || line.trim().startsWith('-')) {
          return `<li class="ml-4">${line.trim()}</li>`;
        }
        // Numbered lists
        if (/^\d+\./.test(line.trim())) {
          return `<li class="ml-4">${line.trim()}</li>`;
        }
        // Section headers
        if (line.startsWith('###')) {
          return `<h4 class="font-bold mt-2 mb-1">${line.replace(/^###\s*/, '')}</h4>`;
        }
        if (line.startsWith('##')) {
          return `<h3 class="font-bold mt-3 mb-2">${line.replace(/^##\s*/, '')}</h3>`;
        }
        return line;
      })
      .join('<br/>');
  };

  const quickQuestions = [
    // Purchase Group
    'Show me pending purchases',
    'List all suppliers',
    'What is my outstanding supplier payments?',
    // Discount
    'What discounts are configured?',
    // History
    'Show me today\'s orders',
    'Analyze my sales history',
    // Reports
    'What is my total inventory value?',
    'Which items are low in stock?',
    // Dashboard
    'Give me a business summary'
  ];

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">
                AI Assistant
              </h1>
              <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                Purchase | Discount | History | Reports | Category | Dashboard
              </p>
            </div>
            <button
              onClick={clearChat}
              className="px-4 py-2 text-sm text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/30 rounded-lg transition-colors"
            >
              Clear History
            </button>
          </div>
        </div>

        {/* Data Categories Info */}
        <div className="bg-gradient-to-r from-indigo-50 to-purple-50 dark:from-indigo-900/20 dark:to-purple-900/20 rounded-xl p-4 mb-6 border border-indigo-200 dark:border-indigo-700">
          <p className="text-xs font-semibold text-indigo-800 dark:text-indigo-300 mb-2">
            I HAVE ACCESS TO:
          </p>
          <div className="flex flex-wrap gap-2">
            <span className="px-2 py-1 bg-white dark:bg-slate-700 rounded text-xs text-slate-600 dark:text-slate-300">Purchases</span>
            <span className="px-2 py-1 bg-white dark:bg-slate-700 rounded text-xs text-slate-600 dark:text-slate-300">Suppliers</span>
            <span className="px-2 py-1 bg-white dark:bg-slate-700 rounded text-xs text-slate-600 dark:text-slate-300">Orders</span>
            <span className="px-2 py-1 bg-white dark:bg-slate-700 rounded text-xs text-slate-600 dark:text-slate-300">History</span>
            <span className="px-2 py-1 bg-white dark:bg-slate-700 rounded text-xs text-slate-600 dark:text-slate-300">Inventory</span>
            <span className="px-2 py-1 bg-white dark:bg-slate-700 rounded text-xs text-slate-600 dark:text-slate-300">Menu</span>
            <span className="px-2 py-1 bg-white dark:bg-slate-700 rounded text-xs text-slate-600 dark:text-slate-300">Categories</span>
            <span className="px-2 py-1 bg-white dark:bg-slate-700 rounded text-xs text-slate-600 dark:text-slate-300">Discounts</span>
            <span className="px-2 py-1 bg-white dark:bg-slate-700 rounded text-xs text-slate-600 dark:text-slate-300">Payments</span>
            <span className="px-2 py-1 bg-white dark:bg-slate-700 rounded text-xs text-slate-600 dark:text-slate-300">Users</span>
          </div>
        </div>

        {/* Chat Container */}
        <div className="bg-white dark:bg-slate-800 rounded-xl shadow-lg overflow-hidden">
          {/* Messages */}
          <div className="h-[500px] overflow-y-auto p-6 space-y-4">
            {messages.map((message, index) => (
              <div
                key={index}
                className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                <div className={`max-w-full lg:max-w-2xl ${message.role === 'user' ? 'order-2' : 'order-1'}`}>
                  <div
                    className={`px-5 py-4 rounded-2xl ${
                      message.role === 'user'
                        ? 'bg-indigo-600 text-white rounded-br-none'
                        : message.isError
                        ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 rounded-bl-none border border-rose-200 dark:border-rose-800'
                        : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-bl-none'
                    }`}
                  >
                    <div
                      className="text-sm leading-relaxed whitespace-pre-wrap"
                      dangerouslySetInnerHTML={{ __html: formatMessage(message.content) }}
                    />
                    <p
                      className={`text-xs mt-2 ${
                        message.role === 'user'
                          ? 'text-indigo-200'
                          : 'text-slate-400'
                      }`}
                    >
                      {formatDateTime(message.timestamp)}
                    </p>
                  </div>
                </div>
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-slate-100 dark:bg-slate-700 px-5 py-4 rounded-2xl rounded-bl-none">
                  <div className="flex space-x-2 items-center">
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                    <div className="w-2 h-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                    <span className="text-xs text-slate-500 dark:text-slate-400 ml-2">AI is thinking...</span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Quick Questions */}
          <div className="px-6 py-4 bg-slate-50 dark:bg-slate-700/50 border-t border-slate-200 dark:border-slate-700">
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Quick questions:</p>
            <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
              {quickQuestions.map((question, index) => (
                <button
                  key={index}
                  onClick={() => setInputValue(question)}
                  className="px-3 py-2 text-xs bg-white dark:bg-slate-600 text-slate-700 dark:text-slate-300 rounded-lg border border-slate-200 dark:border-slate-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:border-indigo-300 transition-colors whitespace-nowrap"
                >
                  {question}
                </button>
              ))}
            </div>
          </div>

          {/* Input Form */}
          <form onSubmit={handleSubmit} className="p-6 border-t border-slate-200 dark:border-slate-700">
            <div className="flex space-x-3">
              <input
                ref={inputRef}
                type="text"
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder="Ask about purchases, orders, inventory, discounts, suppliers..."
                className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:text-slate-100"
                disabled={isLoading}
              />
              <button
                type="submit"
                disabled={isLoading || !inputValue.trim()}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white rounded-xl font-medium transition-colors disabled:cursor-not-allowed"
              >
                Send
              </button>
            </div>
          </form>
        </div>

        {/* Storage indicator */}
        <div className="mt-4 text-center">
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Chat history is automatically saved in your browser
          </p>
        </div>
      </div>
    </div>
  );
}
