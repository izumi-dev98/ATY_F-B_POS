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
        grid
        grid-cols-[auto_1fr_auto]
        items-center
        gap-2
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

      <div
        className="
          flex
          justify-self-center
          justify-center
          min-w-0
          max-w-[260px]
          items-center
          overflow-hidden
          rounded-md
          bg-gradient-to-r
          from-amber-100
          via-rose-100
          to-amber-100
          px-2
          py-0.5
          text-xs
          text-center
          font-bold
          text-rose-700
          shadow
          animate-pulse
          sm:text-sm
          sm:max-w-[340px]
        "
      >
        <span className="truncate">နှစ်သစ်မှာ ရွှင်လန်း ချမ်းမြေ့ကြပါစေ</span>
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
