import { useEffect, useState, useMemo } from "react";
import Swal from "sweetalert2";
import supabase from "../createClients";

export default function Pyaments({ inventory, setInventory }) {
  const [menu, setMenu] = useState([]);
  const [categories, setCategories] = useState([]);
  const [ingredientsMap, setIngredientsMap] = useState({});
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [paymentType, setPaymentType] = useState("Cash"); // "Cash" or "Kpay"

  const safeInventory = Array.isArray(inventory) ? inventory : [];

  const mmkFormatter = new Intl.NumberFormat("en-MM", {
    style: "currency",
    currency: "MMK",
    maximumFractionDigits: 0,
  });

  // Fetch menu and ingredients
  const fetchMenu = async () => {
    try {
      const { data: menuData, error: menuErr } = await supabase
        .from("menu")
        .select("*");
      if (menuErr) throw menuErr;

      const { data: ingData, error: ingErr } = await supabase
        .from("menu_ingredients")
        .select("*");
      if (ingErr) throw ingErr;

      const map = {};
      ingData.forEach((ing) => {
        if (!map[ing.menu_id]) map[ing.menu_id] = [];
        map[ing.menu_id].push(ing);
      });
      setIngredientsMap(map);

      const merged = menuData.map((m) => ({
        ...m,
        ingredients: map[m.id] || [],
      }));
      setMenu(merged);
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to load menu", "error");
      setMenu([]);
    }
  };

  // Fetch categories
  const fetchCategories = async () => {
    try {
      const { data, error } = await supabase.from("categories").select("*").order("name", { ascending: true });
      if (error) throw error;
      setCategories(data || []);
    } catch (err) {
      console.error("Failed to load categories:", err);
    }
  };

  useEffect(() => {
    fetchMenu();
    fetchCategories();
  }, []);

  const filteredMenu = useMemo(
    () =>
      menu.filter((m) => {
        const matchesSearch = (m.menu_name || "").toLowerCase().includes(search.toLowerCase());
        const matchesCategory = selectedCategory === "all" || m.category_id === Number(selectedCategory);
        return matchesSearch && matchesCategory;
      }),
    [menu, search, selectedCategory],
  );

  const addToCart = (item) => {
    const ingredients = ingredientsMap[item.id] || [];
    let maxQty = Infinity;

    for (const ing of ingredients) {
      const inv = safeInventory.find((i) => i.id === ing.inventory_id);
      const stock = inv ? Math.floor(inv.qty / ing.qty) : 0;
      if (stock === 0)
        return Swal.fire(
          "Out of Stock",
          `${item.menu_name} cannot be added`,
          "error",
        );
      if (stock < maxQty) maxQty = stock;
    }

    setCart((prev) => {
      const exist = prev.find((c) => c.id === item.id);
      if (exist) {
        if (exist.qty >= maxQty) {
          Swal.fire(
            "Stock Limit",
            `Cannot add more ${item.menu_name}`,
            "warning",
          );
          return prev;
        }
        return prev.map((c) =>
          c.id === item.id ? { ...c, qty: c.qty + 1 } : c,
        );
      }
      return [...prev, { ...item, qty: 1 }];
    });
  };

  const changeQty = (id, diff) => {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.id === id) {
            const newQty = c.qty + diff;
            if (newQty <= 0) return null;

            const ingredients = ingredientsMap[c.id] || [];
            if (!ingredients.length) return { ...c, qty: newQty };

            const maxQty = Math.min(
              ...ingredients.map((ing) => {
                const inv = safeInventory.find(
                  (i) => i.id === ing.inventory_id,
                );
                return inv ? Math.floor(inv.qty / ing.qty) : 0;
              }),
            );

            if (newQty > maxQty) {
              Swal.fire(
                "Stock Limit",
                `Cannot add more ${c.menu_name}`,
                "warning",
              );
              return c;
            }
            return { ...c, qty: newQty };
          }
          return c;
        })
        .filter(Boolean),
    );
  };

  const clearCart = () => {
    setCart([]);
    setDiscount(0);
    setTax(0);
    setPaymentType("Cash");
  };

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const discountPercent = Number(discount) || 0;
  const taxPercent = Number(tax) || 0;
  const discountAmount = subtotal * (discountPercent / 100);
  const taxAmount = subtotal * (taxPercent / 100);
  const total = subtotal - discountAmount + taxAmount;

  const completeOrder = async () => {
    if (!cart.length)
      return Swal.fire("Cart Empty", "Add items first", "warning");

    try {
      const updatedInventory = safeInventory.map((i) => ({ ...i }));

      // Check inventory before creating order
      for (const item of cart) {
        const ingredients = ingredientsMap[item.id] || [];
        for (const ing of ingredients) {
          const inv = updatedInventory.find((i) => i.id === ing.inventory_id);
          if (!inv || inv.qty < ing.qty * item.qty) {
            throw new Error(
              `Not enough ${inv?.item_name || "Unknown"} for ${item.menu_name}`,
            );
          }
        }
      }

      // Insert order with pending status
      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert([
          {
            subtotal,
            discount_percent: discountPercent,
            discount_amount: discountAmount,
            tax_percent: taxPercent,
            tax_amount: taxAmount,
            total,
            status: "pending",
            payment_type: paymentType,
          },
        ])
        .select()
        .single();
      if (orderErr) throw orderErr;

      // Insert order items and deduct inventory
      for (const item of cart) {
        await supabase.from("order_items").insert({
          order_id: order.id,
          menu_id: item.id,
          qty: item.qty,
          price: item.price,
        });

        // Deduct inventory
        const ingredients = ingredientsMap[item.id] || [];
        for (const ing of ingredients) {
          const inv = updatedInventory.find((i) => i.id === ing.inventory_id);
          const newQty = inv.qty - ing.qty * item.qty;
          await supabase
            .from("inventory")
            .update({ qty: newQty })
            .eq("id", ing.inventory_id);
          inv.qty = newQty;
        }
      }

      // Update inventory state
      setInventory(updatedInventory);

      // Print receipt
      const date = new Date().toLocaleString();
      const receiptContent = `
        <html>
          <head><title>Order #${order.id}</title></head>
          <body style="font-family: monospace; width: 300px; padding: 10px;">
            <h1 style="text-align:center;">F&B ATY SLIP </h1>
            <p>Slip ID: ${order.id}</p>
            <p>Date: ${date}</p>
            <p>Status: PENDING</p>
            <table style="width:100%; border-collapse: collapse;">
              <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
              <tbody>
                ${cart
                  .map(
                    (i) => `<tr>
                  <td>${i.menu_name}</td>
                  <td>${i.qty}</td>
                  <td>${mmkFormatter.format(i.price)}</td>
                  <td>${mmkFormatter.format(i.price * i.qty)}</td>
                </tr>`,
                  )
                  .join("")}
              </tbody>
            </table>
            <hr/>
            <div style="text-align:right;">
              <p>Subtotal: ${mmkFormatter.format(subtotal)}</p>
              ${discountPercent > 0 ? `<p style="color:red;">Discount (${discountPercent}%): -${mmkFormatter.format(discountAmount)}</p>` : ""}
              ${taxPercent > 0 ? `<p style="color:blue;">Tax (${taxPercent}%): +${mmkFormatter.format(taxAmount)}</p>` : ""}
              <p style="font-weight:bold; font-size:1.2em;">Total: ${mmkFormatter.format(total)}</p>
            </div>
            <p style="text-align:center;">Thank you!</p>
          </body>
        </html>
      `;

      const iframe = document.createElement("iframe");
      iframe.style.position = "absolute";
      iframe.style.width = "0";
      iframe.style.height = "0";
      document.body.appendChild(iframe);
      const doc = iframe.contentWindow.document;
      doc.open();
      doc.write(receiptContent);
      doc.close();
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      document.body.removeChild(iframe);

      setCart([]);
      setDiscount(0);
      setTax(0);
      Swal.fire("Success", "Order printed successfully!", "success");
      fetchMenu();
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to create order", "error");
    }
  };

  return (
    <div className="min-h-screen p-6 bg-gray-100 grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Menu */}
      <div className="bg-white rounded-2xl shadow-md p-6">
        <h2 className="text-3xl font-bold mb-5">Menu</h2>
        <input
          type="text"
          placeholder="Search menu..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full p-3 mb-4 border rounded-xl"
        />

        {/* Category Filter Tabs */}
        <div className="mb-4 flex flex-wrap gap-2">
          <button
            onClick={() => setSelectedCategory("all")}
            className={`px-3 py-1.5 rounded-xl text-sm font-medium transition ${
              selectedCategory === "all"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            All
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id.toString())}
              className={`px-3 py-1.5 rounded-xl text-sm font-medium transition ${
                selectedCategory === cat.id.toString()
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              {cat.name}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {filteredMenu.map((item) => (
            <button
              key={item.id}
              onClick={() => addToCart(item)}
              className="border rounded-2xl p-4 text-left hover:shadow"
            >
              <p className="font-semibold">{item.menu_name}</p>
              <p className="text-sm text-gray-500">
                {mmkFormatter.format(item.price)}
              </p>
            </button>
          ))}
        </div>
      </div>

      {/* Cart */}
      <div className="bg-white rounded-2xl shadow-md p-6">
        <h2 className="text-3xl font-bold mb-5">Cart</h2>
        {cart.length === 0 ? (
          <p className="text-gray-400 text-center mt-10">Your cart is empty</p>
        ) : (
          cart.map((item) => (
            <div
              key={item.id}
              className="flex justify-between items-center border rounded-xl p-4 mb-3"
            >
              <div>
                <p className="font-semibold">{item.menu_name}</p>
                <p className="text-sm">
                  {mmkFormatter.format(item.price)} × {item.qty}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => changeQty(item.id, -1)}>−</button>
                <button onClick={() => changeQty(item.id, 1)}>+</button>
              </div>
            </div>
          ))
        )}

        {/* Discount Form */}
        <div className="mt-4 border-t pt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Discount (%)
          </label>
          <input
            type="text"
            inputMode="numeric"
            min="0"
            max="100"
            value={discount}
            onChange={(e) =>
              setDiscount(Math.min(100, Math.max(0, Number(e.target.value))))
            }
            className="w-full p-2 border rounded-xl"
            placeholder="Enter discount %"
          />
        </div>

        {/* Tax Form */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tax (%)
          </label>
          <input
            type="text"
            inputMode="numeric"
            min=""
            max="100"
            value={tax}
            onChange={(e) =>
              setTax(Math.min(100, Math.max(0, Number(e.target.value))))
            }
            className="w-full p-2 border rounded-xl"
            placeholder="Enter tax %"
          />
        </div>

        {/* Price Summary */}
        <div className="mt-4 border-t pt-4">
          <div className="flex justify-between text-sm mb-1">
            <span>Subtotal:</span>
            <span>{mmkFormatter.format(subtotal)}</span>
          </div>
          {discountPercent > 0 && (
            <div className="flex justify-between text-sm mb-1 text-red-500">
              <span>Discount ({discountPercent}%):</span>
              <span>-{mmkFormatter.format(discountAmount)}</span>
            </div>
          )}
          {taxPercent > 0 && (
            <div className="flex justify-between text-sm mb-1 text-blue-500">
              <span>Tax ({taxPercent}%):</span>
              <span>+{mmkFormatter.format(taxAmount)}</span>
            </div>
          )}
          <div className="flex justify-between font-bold text-xl mt-2">
            <span>Total</span>
            <span>{mmkFormatter.format(total)}</span>
          </div>
        </div>

        {/* Payment Type Selection */}
        <div className="mt-4 border-t pt-4">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Payment Type
          </label>
          <div className="flex gap-3">
            <button
              onClick={() => setPaymentType("Kpay")}
              className={`flex-1 py-3 rounded-xl font-medium transition ${
                paymentType === "Kpay"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Kpay
            </button>
            <button
              onClick={() => setPaymentType("Cash")}
              className={`flex-1 py-3 rounded-xl font-medium transition ${
                paymentType === "Cash"
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Cash
            </button>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-4">
          <button
            onClick={clearCart}
            className="flex-1 bg-red-500 text-white py-3 rounded-2xl hover:bg-red-600"
          >
            Cancel
          </button>
          <button
            onClick={completeOrder}
            className="flex-1 bg-blue-600 text-white py-3 rounded-2xl hover:bg-blue-700"
          >
            Print Order
          </button>
        </div>
      </div>
    </div>
  );
}
