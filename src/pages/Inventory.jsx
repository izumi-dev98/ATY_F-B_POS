import { useState, useEffect } from "react";
import Swal from "sweetalert2";
import supabase from "../createClients";

export default function Inventory({
  inventory,
  addInventoryItem,
  updateInventoryItem,
  deleteInventoryItem
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [categories, setCategories] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isEditingCategory, setIsEditingCategory] = useState(false);
  const [editId, setEditId] = useState(null);
  const [editCategoryId, setEditCategoryId] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 5;

  // Get user role
  const user = JSON.parse(localStorage.getItem("user"));
  const isSuperAdmin = user?.role === "superadmin";
  const isAdmin = user?.role === "superadmin" || user?.role === "admin";
  const canManageInventory = isSuperAdmin || isAdmin;

  const formatMMK = (amount) => {
    const num = Number(amount) || 0;
    return new Intl.NumberFormat("my-MM", { style: "currency", currency: "MMK", maximumFractionDigits: 0 }).format(num);
  };

  const [formData, setFormData] = useState({
    item_name: "",
    qty: "",
    type: "",
    category_id: "",
    price: ""
  });

  const [categoryFormData, setCategoryFormData] = useState({
    name: "",
    description: ""
  });

  // Get category name by ID
  const getCategoryName = (categoryId) => {
    if (!categoryId) return "-";
    const cat = categories.find(c => c.id === categoryId);
    return cat ? cat.name : "-";
  };

  // Fetch inventory categories
  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase
        .from("inventory_categories")
        .select("*")
        .order("id", { ascending: true });
      if (error) throw error;
      setCategories(data || []);
    } catch (err) {
      console.error("Error fetching categories:", err);
    }
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  // Filter inventory by search and category
  const filteredInventory = inventory.filter(item => {
    const matchesSearch = item.item_name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || item.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const totalPages = Math.ceil(filteredInventory.length / itemsPerPage);

  const paginatedInventory = filteredInventory.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleChange = (e) =>
    setFormData({ ...formData, [e.target.name]: e.target.value });

  const openAddModal = () => {
    setFormData({ item_name: "", qty: "", type: "", category_id: "", price: "" });
    setIsEditing(false);
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setFormData({
      item_name: item.item_name,
      qty: item.qty,
      type: item.type,
      category_id: item.category_id || "",
      price: item.price || ""
    });
    setEditId(item.id);
    setIsEditing(true);
    setShowModal(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const payload = {
      item_name: formData.item_name,
      qty: Number(formData.qty),
      type: formData.type,
      category_id: formData.category_id || null,
      price: formData.price ? Number(formData.price) : null
    };

    isEditing
      ? await updateInventoryItem(editId, payload)
      : await addInventoryItem(payload);

    setShowModal(false);
    setIsEditing(false);
    setEditId(null);
  };

  // Category CRUD
  const openAddCategoryModal = () => {
    setCategoryFormData({ name: "", description: "" });
    setIsEditingCategory(false);
    setEditCategoryId(null);
    setShowCategoryModal(true);
  };

  const openEditCategoryModal = (cat) => {
    setCategoryFormData({ name: cat.name || "", description: cat.description || "" });
    setEditCategoryId(cat.id);
    setIsEditingCategory(true);
    setShowCategoryModal(true);
  };

  const handleCategorySubmit = async (e) => {
    e.preventDefault();
    if (!categoryFormData.name.trim()) {
      return Swal.fire("Error", "Category name is required", "error");
    }

    try {
      if (isEditingCategory && editCategoryId) {
        const { error } = await supabase
          .from("inventory_categories")
          .update({
            name: categoryFormData.name.trim(),
            description: categoryFormData.description.trim()
          })
          .eq("id", editCategoryId);
        if (error) throw error;
        Swal.fire("Success", "Category updated!", "success");
      } else {
        const { error } = await supabase
          .from("inventory_categories")
          .insert([{
            name: categoryFormData.name.trim(),
            description: categoryFormData.description.trim()
          }]);
        if (error) throw error;
        Swal.fire("Success", "Category created!", "success");
      }
      setShowCategoryModal(false);
      fetchCategories();
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to save category", "error");
    }
  };

  const handleDeleteCategory = async (id) => {
    const result = await Swal.fire({
      title: "Delete this category?",
      text: "Inventory items in this category will have no category.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonText: "Yes, Delete",
      cancelButtonText: "Cancel"
    });
    if (result.isConfirmed) {
      try {
        // Update inventory items to remove category
        await supabase
          .from("inventory")
          .update({ category_id: null })
          .eq("category_id", id);

        // Delete category
        const { error } = await supabase.from("inventory_categories").delete().eq("id", id);
        if (error) throw error;
        Swal.fire("Deleted!", "Category deleted.", "success");
        fetchCategories();
        if (selectedCategory === id) setSelectedCategory("all");
      } catch (err) {
        Swal.fire("Error", err.message || "Failed to delete", "error");
      }
    }
  };

  const handlePrevPage = () => {
    if (currentPage > 1) setCurrentPage(currentPage - 1);
  };

  const handleNextPage = () => {
    if (currentPage < totalPages) setCurrentPage(currentPage + 1);
  };

  return (
    <div className="p-6 bg-slate-50 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-800">Inventory Management</h1>
          <p className="text-sm text-slate-500 mt-1">Manage inventory items</p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <input
            type="search"
            placeholder="Search items..."
            className="flex-1 px-4 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
          />

          {canManageInventory && (
            <button
              onClick={openAddCategoryModal}
              className="px-4 py-2 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700 transition-colors"
            >
              + Category
            </button>
          )}

          <button
            onClick={openAddModal}
            className="px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            disabled={!canManageInventory}
          >
            + Add Item
          </button>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          onClick={() => { setSelectedCategory("all"); setCurrentPage(1); }}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
            selectedCategory === "all"
              ? "bg-indigo-600 text-white"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => { setSelectedCategory(cat.id); setCurrentPage(1); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition flex items-center gap-2 ${
              selectedCategory === cat.id
                ? "bg-indigo-600 text-white"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {cat.name}
            {canManageInventory && (
              <span
                onClick={(e) => { e.stopPropagation(); openEditCategoryModal(cat); }}
                className="text-xs opacity-70 hover:opacity-100"
              >
                ✏️
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-100">
              <tr>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">No</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Item</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-700">Qty</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Unit</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-700">Price</th>
                <th className="px-4 py-3 text-left font-semibold text-slate-700">Category</th>
                <th className="px-4 py-3 text-center font-semibold text-slate-700">Actions</th>
              </tr>
            </thead>
            <tbody>
              {paginatedInventory.length === 0 ? (
                <tr>
                  <td colSpan="7" className="px-4 py-8 text-center text-slate-500">
                    No inventory found
                  </td>
                </tr>
              ) : (
                paginatedInventory.map((item, index) => (
                  <tr key={item.id} className="border-t border-slate-100 hover:bg-indigo-50/50 transition-colors">
                    <td className="px-4 py-3 text-slate-500">{(currentPage - 1) * itemsPerPage + index + 1}</td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{item.item_name}</td>
                    <td className="px-4 py-3 text-center text-slate-600">{item.qty}</td>
                    <td className="px-4 py-3 text-slate-600">{item.type}</td>
                    <td className="px-4 py-3 text-center text-slate-600">
                      {item.price ? formatMMK(item.price) : "-"}
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 bg-violet-100 text-violet-700 rounded-full text-xs font-medium">
                        {getCategoryName(item.category_id)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {canManageInventory && (
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => openEditModal(item)}
                            className="px-3 py-1 text-sm bg-indigo-600 text-white rounded-md hover:bg-indigo-700"
                          >
                            Edit
                          </button>
                          <button
                            onClick={() => deleteInventoryItem(item.id)}
                            className="px-3 py-1 text-sm bg-rose-600 text-white rounded-md hover:bg-rose-700"
                          >
                            Delete
                          </button>
                        </div>
                      )}
                      {!canManageInventory && <span className="text-slate-400 text-sm">View Only</span>}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-4 pb-4">
            <button
              onClick={handlePrevPage}
              disabled={currentPage === 1}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                currentPage === 1
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-indigo-600 text-white hover:bg-indigo-700"
              }`}
            >
              Prev
            </button>
            <button
              onClick={handleNextPage}
              disabled={currentPage === totalPages}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
                currentPage === totalPages
                  ? "bg-slate-100 text-slate-400 cursor-not-allowed"
                  : "bg-indigo-600 text-white hover:bg-indigo-700"
              }`}
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-bold text-slate-800 mb-4">
              {isEditing ? "Edit Item" : "Add Item"}
            </h3>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                name="item_name"
                placeholder="Item name"
                value={formData.item_name}
                onChange={handleChange}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
              <input
                type="number"
                name="qty"
                placeholder="Quantity"
                value={formData.qty}
                onChange={handleChange}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
              <input
                name="type"
                placeholder="Unit"
                value={formData.type}
                onChange={handleChange}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
              <input
                type="number"
                name="price"
                placeholder="Price"
                value={formData.price}
                onChange={handleChange}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                step="0.01"
                min="0"
              />

              <select
                name="category_id"
                value={formData.category_id}
                onChange={handleChange}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Select Category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"
                >
                  {isEditing ? "Update" : "Save"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-xl">
            <h3 className="text-lg font-bold text-slate-800 mb-4">
              {isEditingCategory ? "Edit Category" : "Add Category"}
            </h3>

            <form onSubmit={handleCategorySubmit} className="space-y-4">
              <input
                name="name"
                placeholder="Category name"
                value={categoryFormData.name}
                onChange={(e) => setCategoryFormData({ ...categoryFormData, name: e.target.value })}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                required
              />
              <textarea
                name="description"
                placeholder="Description (optional)"
                value={categoryFormData.description}
                onChange={(e) => setCategoryFormData({ ...categoryFormData, description: e.target.value })}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                rows="3"
              />

              <div className="flex justify-between pt-2">
                {isEditingCategory && (
                  <button
                    type="button"
                    onClick={() => handleDeleteCategory(editCategoryId)}
                    className="px-4 py-2.5 bg-rose-600 text-white rounded-lg text-sm font-medium hover:bg-rose-700"
                  >
                    Delete
                  </button>
                )}
                <div className="flex gap-3 ml-auto">
                  <button
                    type="button"
                    onClick={() => setShowCategoryModal(false)}
                    className="px-4 py-2.5 border border-slate-300 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2.5 bg-violet-600 text-white rounded-lg text-sm font-medium hover:bg-violet-700"
                  >
                    {isEditingCategory ? "Update" : "Save"}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
