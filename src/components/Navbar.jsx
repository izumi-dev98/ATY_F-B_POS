import { useEffect, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faBars } from "@fortawesome/free-solid-svg-icons";
import logo from "../assets/logo.png";

export default function Navbar({ toggleSidebar }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user"));
    setUser(storedUser);
  }, []);

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-12 flex items-center justify-between px-4 sm:px-6 bg-white border-b border-slate-200">
      {/* Left: Sidebar toggle + Logo + App Name */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="text-lg text-slate-700 hover:text-indigo-600 active:scale-95 transition-all"
          aria-label="Toggle Sidebar"
        >
          <FontAwesomeIcon icon={faBars} />
        </button>
        <img src={logo} alt="Logo" className="h-8 w-8 object-contain" />
        <h1 className="text-base sm:text-lg font-bold text-slate-800">
          Myat Taw Win (ATY) F&B System
        </h1>
      </div>

      {/* Right: Logged-in user */}
      {user && (
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-indigo-100 rounded-full flex items-center justify-center">
            <span className="text-indigo-600 font-semibold text-sm">
              {user.username?.charAt(0).toUpperCase()}
            </span>
          </div>
          <span className="hidden sm:inline text-sm font-medium text-slate-700 capitalize">
            {user.username}
          </span>
        </div>
      )}
    </header>
  );
}