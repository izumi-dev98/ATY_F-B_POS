import { useState, useEffect } from "react";
import Swal from "sweetalert2";
import supabase from "../createClients";

export default function Menu({ inventory }) {
  const [menu, setMenu] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [showModal, setShowModal] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editItem, setEditItem] = useState(null);

  const [formData, setFormData] = useState({
    menu_name: "",
    price: "",
    category_id: "",
    ingredients: [{ inventory_id: "", qty: 1 }],
  });

  const safeInventory = Array.isArray(inventory) ? inventory : [];
  const mmkFormatter = new Intl.NumberFormat("en-MM", { style: "currency", currency: "MMK", maximumFractionDigits: 0 });

  // Load menu and ingredients
  const fetchMenu = async () => {
    setLoading(true);
    try {
      const { data: menuData, error: menuErr } = await supabase.from("menu").select("*").order("menu_name", { ascending: true });
      if (menuErr) throw menuErr;

      const { data: ingData, error: ingErr } = await supabase.from("menu_ingredients").select("*");
      if (ingErr) throw ingErr;

      const merged = menuData.map((m) => ({
        ...m,
        ingredients: ingData.filter((i) => i.menu_id === m.id),
      }));

      setMenu(merged);
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to load menu", "error");
      setMenu([]);
    } finally {
      setLoading(false);
    }
  };

  // Load categories
  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase.from("categories").select("*").order("name", { ascending: true });
      if (error) throw error;
      setCategories(data || []);
    } catch (err) {
      console.error("Failed to load categories:", err);
      setCategories([]);
    }
  };

  useEffect(() => { fetchMenu(); fetchCategories(); }, []);

  const openAddModal = () => {
    setFormData({ menu_name: "", price: "", category_id: "", ingredients: [{ inventory_id: "", qty: 1 }] });
    setIsEditing(false);
    setEditItem(null);
    setShowModal(true);
  };

  const openEditModal = (item) => {
    setFormData({
      menu_name: item.menu_name || "",
      price: item.price || "",
      category_id: item.category_id || "",
      ingredients: item.ingredients.length ? item.ingredients : [{ inventory_id: "", qty: 1 }],
    });
    setEditItem(item);
    setIsEditing(true);
    setShowModal(true);
  };

  const handleFormChange = (e) => setFormData({ ...formData, [e.target.name]: e.target.value });

  const handleIngredientChange = (i, e) => {
    const newIngredients = [...formData.ingredients];
    newIngredients[i][e.target.name] =
      e.target.name === "qty"
        ? e.target.value === ""
          ? ""
          : parseFloat(e.target.value)
        : e.target.value;
    setFormData({ ...formData, ingredients: newIngredients });
  };

  const addIngredientRow = () => setFormData({
    ...formData,
    ingredients: [...formData.ingredients, { inventory_id: "", qty: 1 }],
  });

  const removeIngredientRow = (i) => setFormData({
    ...formData,
    ingredients: formData.ingredients.filter((_, idx) => idx !== i),
  });

  const handleSubmit = async (e) => {
    e.preventDefault();
    const validIngredients = (formData.ingredients || []).filter(
      (ing) => ing.inventory_id && Number(ing.qty) > 0
    );

    try {
      if (isEditing && editItem) {
        const { error: updateErr } = await supabase
          .from("menu")
          .update({
            menu_name: formData.menu_name,
            price: Number(formData.price),
            category_id: formData.category_id ? Number(formData.category_id) : null
          })
          .eq("id", editItem.id);
        if (updateErr) throw updateErr;

        await supabase.from("menu_ingredients").delete().eq("menu_id", editItem.id);

        const ingredientsToInsert = validIngredients.map((ing) => ({
          menu_id: editItem.id,
          inventory_id: Number(ing.inventory_id),
          qty: Number(ing.qty),
        }));
        if (ingredientsToInsert.length > 0) {
          const { error: ingredientInsertErr } = await supabase.from("menu_ingredients").insert(ingredientsToInsert);
          if (ingredientInsertErr) throw ingredientInsertErr;
        }
      } else {
        const { data: newMenu, error: insertErr } = await supabase
          .from("menu")
          .insert([{
            menu_name: formData.menu_name,
            price: Number(formData.price),
            category_id: formData.category_id ? Number(formData.category_id) : null
          }])
          .select()
          .single();
        if (insertErr) throw insertErr;

        const ingredientsToInsert = validIngredients.map((ing) => ({
          menu_id: newMenu.id,
          inventory_id: Number(ing.inventory_id),
          qty: Number(ing.qty),
        }));
        if (ingredientsToInsert.length > 0) {
          const { error: ingredientInsertErr } = await supabase.from("menu_ingredients").insert(ingredientsToInsert);
          if (ingredientInsertErr) {
            await supabase.from("menu").delete().eq("id", newMenu.id);
            throw ingredientInsertErr;
          }
        }
      }

      Swal.fire("Success", "Menu saved!", "success");
      setShowModal(false);
      fetchMenu();
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to save menu", "error");
    }
  };

  const handleDelete = async (id) => {
    const res = await Swal.fire({
      title: "Delete this menu?",
      text: "This action cannot be undone.",
      icon: "warning",
      showCancelButton: true,
      confirmButtonColor: "#d33",
      cancelButtonColor: "#3085d6",
      confirmButtonText: "Yes, delete it!"
    });
    if (res.isConfirmed) {
      try {
        await supabase.from("menu_ingredients").delete().eq("menu_id", id);
        await supabase.from("menu").delete().eq("id", id);
        Swal.fire("Deleted!", "Menu item has been removed.", "success");
        fetchMenu();
      } catch (err) {
        Swal.fire("Error", err.message || "Failed to delete", "error");
      }
    }
  };

  const filteredMenu = menu.filter((m) => {
    const matchesSearch = (m.menu_name || "").toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "all" || m.category_id === Number(selectedCategory);
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-gray-50 pb-12">
      {/* Header Section */}
      <div className="bg-white border-b px-6 py-8 mb-8 shadow-sm">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Menu Management</h1>
            <p className="text-gray-500 mt-1">Manage your food and beverage offerings</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 md:flex-none md:w-64">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                placeholder="Search menu..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-300 rounded-xl text-sm w-full focus:ring-2 focus:ring-blue-500"
              />
            </div>
            
            <button
              onClick={openAddModal}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition shadow-sm"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
              </svg>
              Add Menu
            </button>
          </div>
        </div>

        {/* Category Filter Tabs */}
        <div className="max-w-7xl mx-auto mt-6">
          <div className="flex items-center gap-2 overflow-x-auto pb-2 no-scrollbar">
            <button
              onClick={() => setSelectedCategory("all")}
              className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition ${
                selectedCategory === "all"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-200"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              All Items
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id.toString())}
                className={`px-4 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition ${
                  selectedCategory === cat.id.toString()
                    ? "bg-blue-600 text-white shadow-md shadow-blue-200"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            <p className="mt-4 text-gray-500 font-medium">Loading menu...</p>
          </div>
        ) : filteredMenu.length === 0 ? (
          <div className="bg-white rounded-2xl border border-dashed border-gray-300 py-20 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-gray-100 text-gray-400 mb-4">
              <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">No items found</h3>
            <p className="text-gray-500 max-w-xs mx-auto mt-2">Try adjusting your filters or search terms to find what you're looking for.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredMenu.map((item) => (
              <div key={item.id} className="bg-white rounded-2xl shadow-sm border border-gray-200 overflow-hidden flex flex-col hover:shadow-md transition-shadow duration-300">
                <div className="px-5 py-5 border-b bg-gray-50/50 flex justify-between items-start">
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-lg text-gray-900 truncate">{item.menu_name}</h3>
                    {item.category_id && (
                      <span className="inline-flex mt-1 items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-600 border border-blue-100">
                        {categories.find(c => c.id === item.category_id)?.name || "Uncategorized"}
                      </span>
                    )}
                  </div>
                  <div className="text-right ml-2">
                    <span className="text-lg font-bold text-blue-600">{mmkFormatter.format(item.price)}</span>
                  </div>
                </div>

                <div className="px-5 py-4 flex-1">
                  <h4 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-2">Ingredients</h4>
                  <div className="space-y-1.5">
                    {item.ingredients.length === 0 ? (
                      <p className="text-xs text-gray-400 italic">No ingredients specified</p>
                    ) : (
                      item.ingredients.map((ing, idx) => {
                        const inv = safeInventory.find((i) => i.id === Number(ing.inventory_id));
                        return (
                          <div key={idx} className="flex justify-between items-center text-sm">
                            <span className="text-gray-600">{inv?.item_name || "Unknown"}</span>
                            <span className="bg-gray-100 text-gray-700 px-2 py-0.5 rounded text-xs font-bold">{ing.qty}</span>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="px-5 py-4 bg-gray-50/50 border-t flex gap-2">
                  <button
                    onClick={() => openEditModal(item)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded-xl text-xs font-semibold text-gray-700 hover:bg-gray-50 hover:border-gray-400 transition shadow-sm"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(item.id)}
                    className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2 bg-rose-50 border border-rose-100 rounded-xl text-xs font-semibold text-rose-600 hover:bg-rose-100 transition"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-[60] p-4">
          <div className="bg-white rounded-3xl p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-2xl font-bold text-gray-900">{isEditing ? "Edit Menu Item" : "New Menu Item"}</h3>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 p-1">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-gray-500 uppercase ml-1">Menu Name</label>
                <input
                  name="menu_name"
                  placeholder="Enter menu name"
                  value={formData.menu_name}
                  onChange={handleFormChange}
                  className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase ml-1">Price (MMK)</label>
                  <input
                    name="price"
                    type="number"
                    placeholder="0"
                    value={formData.price}
                    onChange={handleFormChange}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition"
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-gray-500 uppercase ml-1">Category</label>
                  <select
                    name="category_id"
                    value={formData.category_id}
                    onChange={handleFormChange}
                    className="w-full px-4 py-3 bg-gray-50 border border-gray-200 rounded-2xl focus:ring-2 focus:ring-blue-500 outline-none transition cursor-pointer"
                  >
                    <option value="">Select Category</option>
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-gray-500 uppercase ml-1">Ingredients</label>
                  <button type="button" onClick={addIngredientRow} className="text-blue-600 text-xs font-bold hover:underline">
                    + Add More
                  </button>
                </div>
                
                <div className="space-y-2">
                  {formData.ingredients.map((ing, i) => (
                    <div key={i} className="flex gap-2 animate-in slide-in-from-left-2 duration-200">
                      <select
                        name="inventory_id"
                        value={ing.inventory_id}
                        onChange={(e) => handleIngredientChange(i, e)}
                        className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition"
                      >
                        <option value="">Select item</option>
                        {safeInventory.map((inv) => (
                          <option key={inv.id} value={inv.id}>{inv.item_name}</option>
                        ))}
                      </select>
                      <input
                        name="qty"
                        type="number"
                        step="0.1"
                        min="0"
                        placeholder="Qty"
                        value={ing.qty}
                        onChange={(e) => handleIngredientChange(i, e)}
                        className="w-20 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 outline-none transition"
                      />
                      {formData.ingredients.length > 1 && (
                        <button type="button" onClick={() => removeIngredientRow(i)} className="text-rose-500 p-2 hover:bg-rose-50 rounded-xl transition">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-6 py-3 bg-gray-100 text-gray-600 font-bold rounded-2xl hover:bg-gray-200 transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 px-6 py-3 bg-blue-600 text-white font-bold rounded-2xl hover:bg-blue-700 transition shadow-md shadow-blue-200"
                >
                  {isEditing ? "Update Item" : "Save Item"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
