import { useState, useEffect } from "react";
import Swal from "sweetalert2";
import supabase from "../createClients";

export default function Category() {
  const [activeTab, setActiveTab] = useState("menu");
  const [categories, setCategories] = useState([]);
  const [inventoryCategories, setInventoryCategories] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editItem, setEditItem] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    description: "",
  });

  // Get user role
  const user = JSON.parse(localStorage.getItem("user"));
  const isSuperAdmin = user?.role === "superadmin";
  const isAdmin = user?.role === "superadmin" || user?.role === "admin";
  const canManageInventory = isSuperAdmin || isAdmin;

  // Fetch menu categories
  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("categories")
        .select("*")
        .order("id", { ascending: true });
      if (error) throw error;
      setCategories(data || []);
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to load categories", "error");
      setCategories([]);
    }
  };

  // Fetch inventory categories
  const fetchInventoryCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("inventory_categories")
        .select("*")
        .order("id", { ascending: true });
      if (error) throw error;
      setInventoryCategories(data || []);
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to load inventory categories", "error");
      setInventoryCategories([]);
    }
  };

  useEffect(() => {
    fetchCategories();
    fetchInventoryCategories();
  }, []);

  const openAddModal = () => {
    setFormData({ name: "", description: "" });
    setIsEditing(false);
    setEditItem(null);
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setFormData({
      name: item.name || "",
      description: item.description || "",
    });
    setEditItem(item);
    setIsEditing(true);
    setShowModal(true);
  };

  const handleFormChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      return Swal.fire("Error", "Category name is required", "error");
    }

    const tableName = activeTab === "menu" ? "categories" : "inventory_categories";

    try {
      if (isEditing && editItem) {
        const { error: updateErr } = await supabase
          .from(tableName)
          .update({
            name: formData.name.trim(),
            description: formData.description.trim(),
          })
          .eq("id", editItem.id);
        if (updateErr) throw updateErr;
        Swal.fire("Success", "Category updated!", "success");
      } else {
        const { error: insertErr } = await supabase
          .from(tableName)
          .insert([{ name: formData.name.trim(), description: formData.description.trim() }]);
        if (insertErr) throw insertErr;
        Swal.fire("Success", "Category created!", "success");
      }
      setShowModal(false);
      if (activeTab === "menu") {
        fetchCategories();
      } else {
        fetchInventoryCategories();
      }
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to save category", "error");
    }
  };

  const handleDelete = async (id) => {
    const tableName = activeTab === "menu" ? "categories" : "inventory_categories";
    const relatedTable = activeTab === "menu" ? "menu" : "inventory";
    const warningText = activeTab === "menu"
      ? "Menu items in this category will be uncategorized."
      : "Inventory items in this category will have no category.";

    const result = await Swal.fire({
      title: "Delete this category?",
      text: warningText,
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel",
    });

    if (result.isConfirmed) {
      try {
        // Update related items to remove category
        await supabase
          .from(relatedTable)
          .update({ category_id: null })
          .eq("category_id", id);

        // Delete category
        const { error } = await supabase.from(tableName).delete().eq("id", id);
        if (error) throw error;
        Swal.fire("Deleted!", "Category deleted.", "success");

        if (activeTab === "menu") {
          fetchCategories();
        } else {
          fetchInventoryCategories();
        }
      } catch (err) {
        Swal.fire("Error", err.message || "Failed to delete", "error");
      }
    }
  };

  const currentCategories = activeTab === "menu" ? categories : inventoryCategories;
  const filteredCategories = currentCategories.filter((c) =>
    (c.name || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Category Management</h1>
          <p className="text-sm text-slate-500 mt-1">Manage menu and inventory categories</p>
        </div>
        <button
          onClick={openAddModal}
          className={`px-4 py-2 text-white text-sm font-medium rounded-lg transition-colors ${activeTab === "menu" ? "bg-indigo-600 hover:bg-indigo-700" : "bg-teal-600 hover:bg-teal-700"}`}
          disabled={activeTab === "inventory" && !canManageInventory}
        >
          + Add Category
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => { setActiveTab("menu"); setSearchTerm(""); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            activeTab === "menu"
              ? "bg-indigo-600 text-white"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          Menu Categories
        </button>
        <button
          onClick={() => { setActiveTab("inventory"); setSearchTerm(""); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            activeTab === "inventory"
              ? "bg-indigo-600 text-white"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          Inventory Categories
        </button>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 mb-6">
        <input
          type="text"
          placeholder={activeTab === "menu" ? "Search menu categories..." : "Search inventory categories..."}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className={`w-full md:w-96 px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${activeTab === "menu" ? "focus:ring-indigo-500" : "focus:ring-teal-500"}`}
        />
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className={activeTab === "menu" ? "bg-indigo-100" : "bg-teal-100"}>
              <tr>
                <th className={`px-4 py-3 text-left font-semibold ${activeTab === "menu" ? "text-indigo-800" : "text-teal-800"}`}>ID</th>
                <th className={`px-4 py-3 text-left font-semibold ${activeTab === "menu" ? "text-indigo-800" : "text-teal-800"}`}>
                  {activeTab === "menu" ? "Menu Category" : "Inventory Category"}
                </th>
                <th className={`px-4 py-3 text-left font-semibold ${activeTab === "menu" ? "text-indigo-800" : "text-teal-800"}`}>Description</th>
                <th className={`px-4 py-3 text-center font-semibold ${activeTab === "menu" ? "text-indigo-800" : "text-teal-800"}`}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredCategories.length === 0 ? (
                <tr>
                  <td colSpan="4" className="px-4 py-8 text-center text-slate-500">
                    {activeTab === "menu" ? "No menu categories found" : "No inventory categories found"}
                  </td>
                </tr>
              ) : (
                filteredCategories.map((item) => (
                  <tr key={item.id} className={`border-t border-slate-100 transition-colors ${activeTab === "menu" ? "hover:bg-indigo-50/50" : "hover:bg-teal-50/50"}`}>
                    <td className="px-4 py-3 text-slate-500">{item.id}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{item.name}</td>
                    <td className="px-4 py-3 text-slate-600">{item.description || "-"}</td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center gap-2">
                        <button
                          onClick={() => openEditModal(item)}
                          className={`px-3 py-1 text-sm text-white rounded-md ${activeTab === "menu" ? "bg-indigo-600 hover:bg-indigo-700" : "bg-teal-600 hover:bg-teal-700"}`}
                          disabled={activeTab === "inventory" && !canManageInventory}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleDelete(item.id)}
                          className="px-3 py-1 text-sm bg-rose-600 text-white rounded-md hover:bg-rose-700"
                          disabled={activeTab === "inventory" && !canManageInventory}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-bold text-slate-800 mb-4">
              {isEditing
                ? (activeTab === "menu" ? "Edit Menu Category" : "Edit Inventory Category")
                : (activeTab === "menu" ? "Add Menu Category" : "Add Inventory Category")
              }
            </h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  {activeTab === "menu" ? "Menu Category Name *" : "Inventory Category Name *"}
                </label>
                <input
                  name="name"
                  placeholder={activeTab === "menu" ? "Menu Category Name" : "Inventory Category Name"}
                  value={formData.name}
                  onChange={handleFormChange}
                  className={`w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${activeTab === "menu" ? "focus:ring-indigo-500" : "focus:ring-teal-500"}`}
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                  Description
                </label>
                <textarea
                  name="description"
                  placeholder="Description (optional)"
                  value={formData.description}
                  onChange={handleFormChange}
                  rows={3}
                  className={`w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 ${activeTab === "menu" ? "focus:ring-indigo-500" : "focus:ring-teal-500"}`}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`px-4 py-2.5 text-white rounded-lg text-sm font-medium ${activeTab === "menu" ? "bg-indigo-600 hover:bg-indigo-700" : "bg-teal-600 hover:bg-teal-700"}`}
                >
                  {isEditing ? "Update" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
