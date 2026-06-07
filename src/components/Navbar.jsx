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
        h-14
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
      <div className="flex items-center gap-3 min-w-0">
        <button
          onClick={toggleSidebar}
          className="
            text-2xl
            sm:text-3xl
            text-gray-700
            hover:text-blue-600
            active:scale-95
            transition
            shrink-0
          "
          aria-label="Toggle Sidebar"
        >
          ☰
        </button>

        <h1 className="truncate text-sm sm:text-lg font-semibold text-gray-800">
          Myat Taw Win (ATY) F&B System
        </h1>
      </div>

      <div className="flex min-w-0 justify-end">
        {user && (
        <div className="flex items-center gap-2 truncate text-gray-700 font-medium text-sm sm:text-base">
          <span className="hidden sm:inline">Hello,</span>
          <span className="capitalize">{user.username}</span>
        </div>
        )}
      </div>
    </header>
  );
}
