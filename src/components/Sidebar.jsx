// components/Sidebar.jsx
import { useState } from "react";
import { NavLink } from "react-router-dom";

const accessRights = {
  superadmin: ["dashboard", "payments", "history", "menu", "inventory", "report", "user-create"],
  admin: ["dashboard", "history", "inventory", "report" , "payments",  "menu",],
  chef: ["dashboard",  "history", "report", "menu"],
  user: ["dashboard", "payments", "history", "report"],
};

export default function Sidebar({ isOpen }) {
  const [reportOpen, setReportOpen] = useState(false);
  const user = JSON.parse(localStorage.getItem("user"));
  const roleAccess = user ? accessRights[user.role] : [];

  const baseLink =
    "block px-4 py-2 rounded-lg border transition text-sm";
  const normal =
    "border-gray-300 text-gray-700 hover:text-blue-600 hover:border-blue-400";
  const active =
    "bg-blue-50 text-blue-600 border-blue-500 font-semibold";

  return (
    <aside
      className={`
        fixed
        top-10
        left-0
        z-40
        h-[calc(100vh-3.5rem)]
        w-60
        bg-white
        border-r
        transform
        transition-transform
        duration-300
        ${isOpen ? "translate-x-0" : "-translate-x-full"}
      `}
    >
      <nav className="p-4 space-y-2 overflow-y-auto h-full">

        {roleAccess.includes("dashboard") && (
          <NavLink
            to="/dashboard"
            className={({ isActive }) =>
              `${baseLink} ${isActive ? active : normal}`
            }
          >
            Dashboard
          </NavLink>
        )}

        {roleAccess.includes("payments") && (
          <NavLink
            to="/payments"
            className={({ isActive }) =>
              `${baseLink} ${isActive ? active : normal}`
            }
          >
            Payments
          </NavLink>
        )}

        {roleAccess.includes("history") && (
          <NavLink
            to="/history"
            className={({ isActive }) =>
              `${baseLink} ${isActive ? active : normal}`
            }
          >
            History
          </NavLink>
        )}

        {roleAccess.includes("menu") && (
          <NavLink
            to="/menu"
            className={({ isActive }) =>
              `${baseLink} ${isActive ? active : normal}`
            }
          >
            Menu
          </NavLink>
        )}

        {roleAccess.includes("inventory") && (
          <NavLink
            to="/inventory"
            className={({ isActive }) =>
              `${baseLink} ${isActive ? active : normal}`
            }
          >
            Inventory
          </NavLink>
        )}

        {roleAccess.includes("report") && (
          <div>
            <button
              onClick={() => setReportOpen(!reportOpen)}
              className={`${baseLink} ${normal} w-full text-left`}
            >
              Reports
            </button>

            {reportOpen && (
              <div className="mt-2 ml-3 space-y-1">
                <NavLink
                  to="/reports/inventory"
                  className={({ isActive }) =>
                    `${baseLink} text-xs ${
                      isActive ? active : "border-gray-200 text-gray-600 hover:text-blue-500"
                    }`
                  }
                >
                  Inventory Report
                </NavLink>

                <NavLink
                  to="/reports/total-sales"
                  className={({ isActive }) =>
                    `${baseLink} text-xs ${
                      isActive ? active : "border-gray-200 text-gray-600 hover:text-blue-500"
                    }`
                  }
                >
                  Total Sales Report
                </NavLink>
              </div>
            )}
          </div>
        )}

        {roleAccess.includes("user-create") && (
          <NavLink
            to="/user-create"
            className={({ isActive }) =>
              `${baseLink} ${isActive ? active : normal}`
            }
          >
            Create User
          </NavLink>
        )}

        <NavLink
          to="/logout"
          className={`${baseLink} border-red-300 text-red-500 hover:bg-red-50`}
        >
          Logout
        </NavLink>

      </nav>
    </aside>
  );
}
