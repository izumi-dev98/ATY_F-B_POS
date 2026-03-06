import { useEffect, useState } from "react";

export default function Navbar({ toggleSidebar }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    const storedUser = JSON.parse(localStorage.getItem("user"));
    setUser(storedUser);
  }, []);

  return (
    <header
      className="
        fixed
        top-0
        left-0
        right-0
        z-50
        h-10
        flex
        items-center
        justify-between
        px-4
        sm:px-6
        bg-white
        border-b
        shadow-sm
      "
    >
      {/* Left: Sidebar toggle + App Name */}
      <div className="flex items-center gap-3">
        <button
          onClick={toggleSidebar}
          className="
            text-2xl
            sm:text-3xl
            text-gray-700
            hover:text-blue-600
            active:scale-95
            transition
          "
          aria-label="Toggle Sidebar"
        >
          ☰
        </button>

        <h1 className="text-base sm:text-lg font-semibold text-gray-800">
          Myat Taw Win (ATY) F&B System
        </h1>
      </div>

      {/* Right: Logged-in user */}
      {user && (
        <div className="flex items-center gap-2 text-gray-700 font-medium text-sm sm:text-base">
          <span className="hidden sm:inline">Hello,</span>
          <span className="capitalize">{user.username}</span>
        </div>
      )}
    </header>
  );
}
