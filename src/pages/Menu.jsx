import { useState, useEffect } from "react";
import Swal from "sweetalert2";
import supabase from "../createClients";

export default function Menu({ inventory }) {
  const [menu, setMenu] = useState([]);
  const [categories, setCategories] = useState([]);
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
    try {
      const { data: menuData, error: menuErr } = await supabase.from("menu").select("*");
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
      icon: "warning",
      showCancelButton: true,
    });
    if (res.isConfirmed) {
      try {
        await supabase.from("menu_ingredients").delete().eq("menu_id", id);
        await supabase.from("menu").delete().eq("id", id);
        Swal.fire("Deleted!", "", "success");
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
    <div className="p-6 bg-gray-100 min-h-screen">
      <div className="flex justify-between items-center mb-6">
        <input
          type="text"
          placeholder="Search menu..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="px-4 py-2 border rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
        />
        <button
          onClick={openAddModal}
          className="px-5 py-2 bg-green-600 text-white rounded-2xl shadow hover:bg-green-700 transition"
        >
          + Add Menu
        </button>
      </div>

      {/* Category Filter Tabs */}
      <div className="mb-6 flex flex-wrap gap-2">
        <button
          onClick={() => setSelectedCategory("all")}
          className={`px-4 py-2 rounded-2xl text-sm font-medium transition ${
            selectedCategory === "all"
              ? "bg-blue-600 text-white"
              : "bg-white text-gray-700 hover:bg-gray-200"
          }`}
        >
          All
        </button>
        {categories.map((cat) => (
          <button
            key={cat.id}
            onClick={() => setSelectedCategory(cat.id.toString())}
            className={`px-4 py-2 rounded-2xl text-sm font-medium transition ${
              selectedCategory === cat.id.toString()
                ? "bg-blue-600 text-white"
                : "bg-white text-gray-700 hover:bg-gray-200"
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredMenu.map((item) => (
          <div key={item.id} className="bg-white shadow-lg rounded-2xl p-5 hover:shadow-2xl transition">
            <h3 className="font-bold text-xl text-gray-800">{item.menu_name}</h3>
            <p className="text-gray-500 mb-1">{mmkFormatter.format(item.price)}</p>
            {item.category_id && (
              <p className="text-xs text-blue-600 mb-3">
                {categories.find(c => c.id === item.category_id)?.name || "Uncategorized"}
              </p>
            )}
            <div className="text-sm text-gray-600 mb-3">
              {item.ingredients.map((ing, idx) => {
                const inv = safeInventory.find((i) => i.id === Number(ing.inventory_id));
                return (
                  <div key={idx}>
                    {inv?.item_name || "Unknown"} × {ing.qty}
                  </div>
                );
              })}
            </div>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => openEditModal(item)}
                className="px-3 py-1 bg-blue-600 text-white rounded-2xl hover:bg-blue-700 transition"
              >
                Edit
              </button>
              <button
                onClick={() => handleDelete(item.id)}
                className="px-3 py-1 bg-red-500 text-white rounded-2xl hover:bg-red-600 transition"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex justify-center items-center z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-lg">
            <h3 className="text-2xl font-bold mb-4">{isEditing ? "Edit Menu" : "Add Menu"}</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                name="menu_name"
                placeholder="Menu Name"
                value={formData.menu_name}
                onChange={handleFormChange}
                className="w-full px-3 py-2 border rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                required
              />
              <input
                name="price"
                type="number"
                placeholder="Price"
                value={formData.price}
                onChange={handleFormChange}
                className="w-full px-3 py-2 border rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                required
              />
              <select
                name="category_id"
                value={formData.category_id}
                onChange={handleFormChange}
                className="w-full px-3 py-2 border rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
              >
                <option value="">Select Category (Optional)</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
              <p className="font-semibold">Ingredients</p>
              {formData.ingredients.map((ing, i) => (
                <div key={i} className="flex gap-2 mb-2">
                  <select
                    name="inventory_id"
                    value={ing.inventory_id}
                    onChange={(e) => handleIngredientChange(i, e)}
                    className="flex-1 px-2 py-1 border rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
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
                    value={ing.qty}
                    onChange={(e) => handleIngredientChange(i, e)}
                    className="w-20 px-2 py-1 border rounded-2xl shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                  />

                  {formData.ingredients.length > 1 && (
                    <button type="button" onClick={() => removeIngredientRow(i)} className="text-red-500 font-bold">✕</button>
                  )}
                </div>
              ))}
              <button type="button" onClick={addIngredientRow} className="text-blue-600 text-sm hover:underline">+ Add Ingredient</button>

              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setShowModal(false)} className="px-4 py-2 bg-gray-300 rounded-2xl hover:bg-gray-400 transition">Cancel</button>
                <button type="submit" className="px-4 py-2 bg-green-600 text-white rounded-2xl hover:bg-green-700 transition">{isEditing ? "Update" : "Save"}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
