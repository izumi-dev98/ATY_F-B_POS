import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars, faMoon, faSun } from "@fortawesome/free-solid-svg-icons";
import logo from "../assets/logo.png";

export default function Navbar({ toggleSidebar, theme, toggleTheme }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user"));
    setUser(storedUser);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-12 flex items-center justify-between px-4 sm:px-6 bg-white border-b border-slate-200 dark:bg-slate-800 dark:border-slate-700">
      {/* Left: Sidebar toggle + Logo + App Name */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="text-lg text-slate-700 hover:text-indigo-600 active:scale-95 transition-all dark:text-slate-200 dark:hover:text-indigo-400"
          aria-label="Toggle Sidebar"
        >
          <FontAwesomeIcon icon={faBars} />
        </button>
        <img src={logo} alt="Logo" className="h-8 w-8 object-contain" />
        <h1 className="text-base sm:text-lg font-bold text-slate-800 dark:text-slate-100">
          Myat Taw Win (ATY) F&B System
        </h1>
      </div>

      {/* Right: Theme toggle + Logged-in user */}
      {user && (
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-full border border-slate-300 text-slate-700 hover:text-indigo-600 hover:border-indigo-400 flex items-center justify-center transition-all dark:border-slate-600 dark:text-slate-200 dark:hover:text-indigo-400"
            aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            title={theme === "dark" ? "Light Mode" : "Dark Mode"}
          >
            <FontAwesomeIcon icon={theme === "dark" ? faSun : faMoon} />
          </button>
          <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center dark:bg-indigo-900/60">
            <span className="text-indigo-600 font-semibold text-sm">
              {user.username?.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="hidden sm:inline text-sm font-medium text-slate-700 capitalize dark:text-slate-200">
            {user.username}
          </span>
        </div>
      )}
    </header>
  );
}
