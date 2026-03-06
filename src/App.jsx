import { useEffect, useState } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import Swal from "sweetalert2";

import Sidebar from "./components/Sidebar";
import Navbar from "./components/Navbar";
import Dashboard from "./pages/Dashboard";
import Payments from "./pages/Pyaments";
import History from "./pages/History";
import Menu from "./pages/Menu";
import Inventory from "./pages/Inventory";

import supabase from "./createClients";
import InventoryReport from "./pages/InventoryReport";
import TotalSalesReport from "./pages/TotalSalesReport";

import UserCreate from "./pages/UserCreate";

import PrivateRoute from "./pages/PrivateRoute";
import Login from "./pages/ Login";
import Logout from "./pages/Logout";

// -------------------- ACCESS RIGHTS --------------------
const accessRights = {
  superadmin: ["dashboard", "payments", "history", "menu", "inventory", "report"],
  admin: ["dashboard", "history", "inventory", "report" ,"payments","menu",],
  chef: ["dashboard",  "history", "report", "menu"],
  user: ["dashboard", "payments", "history", "report"],
};

export default function App() {
  const [isOpen, setIsOpen] = useState(window.innerWidth >= 768);
  const [inventory, setInventory] = useState([]);
  const [menu, setMenu] = useState([]);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // ------------------- RESPONSIVE SIDEBAR -------------------
  useEffect(() => {
    const handleResize = () => setIsOpen(window.innerWidth >= 768);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const toggleSidebar = () => setIsOpen((prev) => !prev);

  // ------------------- AUTH STATE -------------------
  useEffect(() => {
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user || null);
      setLoading(false);
    };
    getSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user || null);
      setLoading(false);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  // ------------------- INVENTORY -------------------
  const fetchInventory = async () => {
    const { data, error } = await supabase.from("inventory").select("*").order("id", { ascending: true });
    if (error) Swal.fire("Error", error.message, "error");
    else setInventory(data);
  };
  useEffect(() => { fetchInventory(); }, []);

  const addInventoryItem = async (item) => {
    const { data, error } = await supabase.from("inventory").insert([item]).select().single();
    if (error) Swal.fire("Error", error.message, "error");
    else { setInventory(prev => [...prev, data]); Swal.fire("Success", "Inventory added", "success"); }
  };
  const updateInventoryItem = async (id, updatedItem) => {
    const { data, error } = await supabase.from("inventory").update(updatedItem).eq("id", id).select().single();
    if (error) Swal.fire("Error", error.message, "error");
    else { setInventory(prev => prev.map(i => i.id === id ? data : i)); Swal.fire("Success", "Inventory updated", "success"); }
  };
  const deleteInventoryItem = async (id) => {
    const result = await Swal.fire({ title: "Delete Inventory?", icon: "warning", showCancelButton: true, confirmButtonText: "Yes" });
    if (result.isConfirmed) {
      const { error } = await supabase.from("inventory").delete().eq("id", id);
      if (error) Swal.fire("Error", error.message, "error");
      else { setInventory(prev => prev.filter(i => i.id !== id)); Swal.fire("Deleted", "Inventory removed", "success"); }
    }
  };

  // ------------------- MENU -------------------
  const fetchMenu = async () => {
    const { data, error } = await supabase.from("menu").select("*").order("id", { ascending: true });
    if (error) Swal.fire("Error", error.message, "error");
    else setMenu(data);
  };
  useEffect(() => { fetchMenu(); }, []);

  const addMenuItem = async (item) => {
    const { data, error } = await supabase.from("menu").insert([item]).select().single();
    if (error) Swal.fire("Error", error.message, "error");
    else { setMenu(prev => [...prev, data]); Swal.fire("Success", "Menu added", "success"); }
  };
  const updateMenuItem = async (id, updatedItem) => {
    const { data, error } = await supabase.from("menu").update(updatedItem).eq("id", id).select().single();
    if (error) Swal.fire("Error", error.message, "error");
    else { setMenu(prev => prev.map(m => m.id === id ? data : m)); Swal.fire("Updated", "Menu updated", "success"); }
  };
  const deleteMenuItem = async (id) => {
    const result = await Swal.fire({ title: "Delete Menu?", icon: "warning", showCancelButton: true, confirmButtonText: "Yes" });
    if (result.isConfirmed) {
      const { error } = await supabase.from("menu").delete().eq("id", id);
      if (error) Swal.fire("Error", error.message, "error");
      else { setMenu(prev => prev.filter(m => m.id !== id)); Swal.fire("Deleted", "Menu deleted", "success"); }
    }
  };

  // ------------------- LOADING -------------------
  if (loading) return <div className="flex justify-center items-center h-screen">Loading...</div>;

  // ------------------- RENDER -------------------
  return (
    <div className="flex">
      {user && <Sidebar isOpen={isOpen} toggleSidebar={toggleSidebar} />}
      <div className={`flex-1 min-h-screen bg-gray-100 ${user && isOpen ? "ml-60" : "ml-0"}`}>
        {user && <Navbar toggleSidebar={toggleSidebar} />}
        <main className="p-6">
          <Routes>
            {/* Login redirects to dashboard if already logged in */}
            <Route
              path="/"
              element={
                user ? (
                  <Navigate to="/dashboard" replace />
                ) : (
                  <Login setUser={setUser} />
                )
              }
            />

            <Route path="/logout" element={<Logout setUser={setUser} />} />


            {/* Protected routes */}
            <Route path="/dashboard" element={<PrivateRoute user={user}><Dashboard /></PrivateRoute>} />
            <Route path="/payments" element={<PrivateRoute user={user}><Payments inventory={inventory} setInventory={setInventory} menu={menu} /></PrivateRoute>} />
            <Route path="/history" element={<PrivateRoute user={user}><History setInventory={setInventory} /></PrivateRoute>} />
            <Route path="/menu" element={<PrivateRoute user={user} allowedRoles={['superadmin', 'chef']}><Menu menu={menu} inventory={inventory} addMenuItem={addMenuItem} updateMenuItem={updateMenuItem} deleteMenuItem={deleteMenuItem} /></PrivateRoute>} />
            <Route path="/inventory" element={<PrivateRoute user={user} allowedRoles={['superadmin', 'admin']}><Inventory inventory={inventory} addInventoryItem={addInventoryItem} updateInventoryItem={updateInventoryItem} deleteInventoryItem={deleteInventoryItem} /></PrivateRoute>} />
            <Route path="/reports/inventory" element={<PrivateRoute user={user}><InventoryReport /></PrivateRoute>} />
            <Route path="/reports/total-sales" element={<PrivateRoute user={user}><TotalSalesReport /></PrivateRoute>} />
            <Route path="/user-create" element={<PrivateRoute user={user} allowedRoles={['superadmin']}><UserCreate /></PrivateRoute>} />

            {/* Unknown paths */}
            <Route path="*" element={user ? <Navigate to="/dashboard" replace /> : <Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </div>
  );
}
