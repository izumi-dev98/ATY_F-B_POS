import { useState } from "react";
import { NavLink } from "react-router-dom";

const accessRights = {
  superadmin: ["dashboard", "payments", "history", "menu", "category", "inventory", "report", "user-create", "internal-consumption", "discount-type", "purchase"],
  admin: ["dashboard", "history", "inventory", "report" , "payments",  "menu", "category", "internal-consumption", "discount-type", "purchase"],
  chef: ["dashboard",  "history", "report", "menu", "category", "internal-consumption"],
  user: ["dashboard", "payments", "history", "report", "internal-consumption"],
};

export default function Sidebar({ isOpen }) {
  const [reportOpen, setReportOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const user = JSON.parse(localStorage.getItem("user"));
  const roleAccess = user ? accessRights[user.role] : [];

  const baseLink = "block px-4 py-2.5 rounded-lg text-sm font-medium transition-all";
  const normal = "text-slate-600 hover:bg-slate-100 hover:text-indigo-600 dark:text-slate-300 dark:hover:bg-slate-700/60 dark:hover:text-indigo-400";
  const active = "bg-indigo-50 text-indigo-600 font-semibold dark:bg-indigo-900/40 dark:text-indigo-300";

  return (
    <aside className={`fixed top-12 left-0 z-40 h-[calc(100vh-3rem)] w-60 bg-white border-r border-slate-200 dark:bg-slate-800 dark:border-slate-700 transform transition-transform duration-300 ${isOpen ? "translate-x-0" : "-translate-x-full"}`}>
      <nav className="p-3 space-y-1 overflow-y-auto h-full">

        {roleAccess.includes("dashboard") && (
          <NavLink to="/dashboard" className={({ isActive }) => `${baseLink} ${isActive ? active : normal}`}>
            Dashboard
          </NavLink>
        )}

        {roleAccess.includes("payments") && (
          <NavLink to="/payments" className={({ isActive }) => `${baseLink} ${isActive ? active : normal}`}>
            Payments
          </NavLink>
        )}

        {roleAccess.includes("history") && (
          <NavLink to="/history" className={({ isActive }) => `${baseLink} ${isActive ? active : normal}`}>
            History
          </NavLink>
        )}

        {roleAccess.includes("menu") && (
          <NavLink to="/menu" className={({ isActive }) => `${baseLink} ${isActive ? active : normal}`}>
            Menu
          </NavLink>
        )}

        {roleAccess.includes("category") && (
          <NavLink to="/category" className={({ isActive }) => `${baseLink} ${isActive ? active : normal}`}>
            Category
          </NavLink>
        )}

        {roleAccess.includes("inventory") && (
          <NavLink to="/inventory" className={({ isActive }) => `${baseLink} ${isActive ? active : normal}`}>
            Inventory
          </NavLink>
        )}

        {roleAccess.includes("internal-consumption") && (
          <NavLink to="/internal-consumption" className={({ isActive }) => `${baseLink} ${isActive ? active : normal}`}>
            Internal Consumption
          </NavLink>
        )}

        {roleAccess.includes("discount-type") && (
          <NavLink to="/discount-type" className={({ isActive }) => `${baseLink} ${isActive ? active : normal}`}>
            Discount Type
          </NavLink>
        )}

        {roleAccess.includes("purchase") && (
          <div>
            <button onClick={() => setPurchaseOpen(!purchaseOpen)} className={`${baseLink} ${normal} w-full text-left flex justify-between items-center`}>
              <span>Purchase</span>
              <svg className={`w-4 h-4 transition-transform ${purchaseOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {purchaseOpen && (
              <div className="mt-1 ml-3 space-y-1 border-l-2 border-indigo-200 pl-3 dark:border-indigo-800">
                <NavLink to="/purchase" className={({ isActive }) => `${baseLink} text-xs ${isActive ? active : "text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300"}`}>
                  Purchase Order
                </NavLink>
                <NavLink to="/supplier" className={({ isActive }) => `${baseLink} text-xs ${isActive ? active : "text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300"}`}>
                  Supplier
                </NavLink>
                <NavLink to="/purchase-return" className={({ isActive }) => `${baseLink} text-xs ${isActive ? active : "text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300"}`}>
                  Purchase Return
                </NavLink>
                
                <NavLink to="/supplier-outstanding" className={({ isActive }) => `${baseLink} text-xs ${isActive ? active : "text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300"}`}>
                  Supplier Outstanding
                </NavLink>

              </div>
            )}
          </div>
        )}

        {roleAccess.includes("report") && (
          <div>
            <button onClick={() => setReportOpen(!reportOpen)} className={`${baseLink} ${normal} w-full text-left flex justify-between items-center`}>
              <span>Reports</span>
              <svg className={`w-4 h-4 transition-transform ${reportOpen ? "rotate-180" : ""}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {reportOpen && (
              <div className="mt-1 ml-3 space-y-1 border-l-2 border-indigo-200 pl-3 dark:border-indigo-800">
                <NavLink to="/reports/inventory" className={({ isActive }) => `${baseLink} text-xs ${isActive ? active : "text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300"}`}>
                  Inventory Report
                </NavLink>
                <NavLink to="/reports/total-sales" className={({ isActive }) => `${baseLink} text-xs ${isActive ? active : "text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300"}`}>
                  Total Sales Report
                </NavLink>
                <NavLink to="/reports/usage" className={({ isActive }) => `${baseLink} text-xs ${isActive ? active : "text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300"}`}>
                  Usage Report
                </NavLink>
                <NavLink to="/reports/add-stock" className={({ isActive }) => `${baseLink} text-xs ${isActive ? active : "text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300"}`}>
                  Add Stock Report
                </NavLink>
                <NavLink to="/purchase-report" className={({ isActive }) => `${baseLink} text-xs ${isActive ? active : "text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300"}`}>
                  Purchase Report
                </NavLink>
                <NavLink to="/reports/supplier-outstanding" className={({ isActive }) => `${baseLink} text-xs ${isActive ? active : "text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-300"}`}>
                  Supplier Outstanding Report
                </NavLink>
              </div>
            )}
          </div>
        )}

        {roleAccess.includes("user-create") && (
          <NavLink to="/user-create" className={({ isActive }) => `${baseLink} ${isActive ? active : normal}`}>
            Create User
          </NavLink>
        )}

        <NavLink to="/logout" className={`${baseLink} text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-900/30`}>
          Logout
        </NavLink>

      </nav>
    </aside>
  );
}
