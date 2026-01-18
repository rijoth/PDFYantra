import React from 'react';

const Footer: React.FC = () => {
  return (
    <footer className="w-full py-8 mt-auto border-t border-surfaceVariant/20 animate-fade-in">
      <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4 text-xs font-medium text-secondary">
        
        {/* Copyright */}
        <div className="flex items-center gap-2 opacity-80">
          <span>&copy; PDFYantra 2026</span>
          <span className="hidden md:inline px-1">•</span>
          <span className="hidden md:inline">Privacy-First PDF Tools</span>
        </div>

        {/* Links */}
        <div className="flex items-center gap-6">
          <a
            href="https://github.com/rijoth/PDFYantra"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 hover:text-primary transition-colors group"
            aria-label="View Source on GitHub"
          >
            <i className="fa-brands fa-github text-lg group-hover:scale-110 transition-transform duration-200"></i>
          </a>
        </div>

      </div>
    </footer>
  );
};

export default Footer;