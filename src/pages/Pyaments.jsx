import { useEffect, useState, useMemo } from "react";
import Swal from "sweetalert2";
import supabase from "../createClients";

export default function Pyaments({ inventory, setInventory, user }) {
  const [menu, setMenu] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [ingredientsMap, setIngredientsMap] = useState({});
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [cart, setCart] = useState([]);
  const [discount, setDiscount] = useState(0);
  const [tax, setTax] = useState(0);
  const [paymentType, setPaymentType] = useState("Cash"); // "Cash", "Kpay", or "FOC"
  const [remark, setRemark] = useState("");
  const [discountTypes, setDiscountTypes] = useState([]);
  const [selectedDiscountType, setSelectedDiscountType] = useState(null);

  const isAdmin = user?.role === "superadmin" || user?.role === "admin";
  const safeInventory = Array.isArray(inventory) ? inventory : [];
  const mmkFormatter = new Intl.NumberFormat("en-MM", {
    style: "currency",
    currency: "MMK",
    maximumFractionDigits: 0,
  });

  // Fetch menu and ingredients
  const fetchMenu = async () => {
    setLoading(true);
    try {
      const { data: menuData, error: menuErr } = await supabase.from("menu").select("*").order("menu_name", { ascending: true });
      if (menuErr) throw menuErr;

      const { data: ingData, error: ingErr } = await supabase.from("menu_ingredients").select("*");
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
    } finally {
      setLoading(false);
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

  // Fetch discount types
  const fetchDiscountTypes = async () => {
    try {
      const { data, error } = await supabase.from("discount_types").select("*").order("id", { ascending: true });
      if (error) throw error;
      setDiscountTypes(data || []);
    } catch (err) {
      console.error("Failed to load discount types:", err);
    }
  };

  useEffect(() => {
    fetchMenu();
    fetchCategories();
    fetchDiscountTypes();
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
          `${item.menu_name} is out of stock`,
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
            `Cannot add more ${item.menu_name}. Max available: ${maxQty}`,
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
                `Cannot add more ${c.menu_name}. Max available: ${maxQty}`,
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
    setRemark("");
    setSelectedDiscountType(null);
  };

  const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  const discountPercent = Number(discount) || 0;
  const taxPercent = Number(tax) || 0;
  const discountAmount = subtotal * (discountPercent / 100);
  const taxAmount = subtotal * (taxPercent / 100);
  const total = subtotal - discountAmount + taxAmount;

  const completeOrder = async () => {
    if (!cart.length)
      return Swal.fire("Cart Empty", "Please add items to cart first", "warning");

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
            remark: remark || null,
            discount_type: selectedDiscountType?.name || null,
            role: user?.role || null,
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
            ${remark ? `<p>Remark: ${remark}</p>` : ""}
            <table style="width:100%; border-collapse: collapse;">
              <thead><tr><th>Item</th><th>Qty</th><th>Price</th><th>Total</th></tr></thead>
              <tbody>
                ${cart.map((i) => `<tr>
                  <td>${i.menu_name}</td>
                  <td>${i.qty}</td>
                  <td>${mmkFormatter.format(i.price)}</td>
                  <td>${mmkFormatter.format(i.price * i.qty)}</td>
                </tr>`).join("")}
              </tbody>
            </table>
            <hr/>
            <div style="text-align:right;">
              <p>Subtotal: ${mmkFormatter.format(subtotal)}</p>
              ${discountPercent > 0 ? `<p style="color:black;">Discount (${discountPercent}%): -${mmkFormatter.format(discountAmount)}</p>` : ""}
              ${taxPercent > 0 ? `<p style="color:black;">Tax (${taxPercent}%): +${mmkFormatter.format(taxAmount)}</p>` : ""}
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
      setRemark("");
      setSelectedDiscountType(null);
      Swal.fire("Success", "Order printed successfully!", "success");
      fetchMenu();
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to create order", "error");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-8">
      {/* Header Section - COMPACT */}
      <div className="bg-white border-b px-6 py-3 shadow-sm mb-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Point of Sale</h1>
          </div>
          
          <div className="relative w-full md:w-72">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </div>
            <input
              type="text"
              placeholder="Search menu..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm w-full focus:ring-2 focus:ring-blue-500 transition"
            />
          </div>
        </div>

        {/* Category Tabs */}
        <div className="max-w-7xl mx-auto mt-3">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            <button
              onClick={() => setSelectedCategory("all")}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition ${
                selectedCategory === "all" ? "bg-blue-600 text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >
              All Items
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id.toString())}
                className={`px-4 py-1.5 rounded-lg text-xs font-bold whitespace-nowrap transition ${
                  selectedCategory === cat.id.toString() ? "bg-blue-600 text-white shadow-sm" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Menu Section */}
        <div className="lg:col-span-7">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 bg-white rounded-3xl border border-gray-100 shadow-sm">
              <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : filteredMenu.length === 0 ? (
            <div className="bg-white rounded-3xl border border-dashed border-gray-300 py-20 text-center">
              <h3 className="text-sm font-bold text-gray-400">No items found</h3>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {filteredMenu.map((item) => (
                <button
                  key={item.id}
                  onClick={() => addToCart(item)}
                  className="group flex flex-col bg-white p-4 rounded-xl shadow-sm border border-gray-100 hover:border-blue-300 hover:shadow-md transition-all text-left"
                >
                  <h3 className="text-xs font-bold text-gray-800 line-clamp-2 leading-tight group-hover:text-blue-600 transition-colors">{item.menu_name}</h3>
                  <p className="mt-auto pt-3 text-blue-600 font-black text-sm">{mmkFormatter.format(item.price)}</p>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Cart Section - STICKY TOP */}
        <div className="lg:col-span-5 sticky top-20 self-start">
          <div className="bg-white rounded-3xl shadow-xl border border-gray-100 overflow-hidden flex flex-col max-h-[calc(100vh-120px)]">
            <div className="px-5 py-3 border-b flex items-center justify-between bg-gray-50/50">
              <h2 className="text-lg font-black text-gray-900 flex items-center gap-2">
                Cart
                <span className="bg-blue-600 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{cart.length}</span>
              </h2>
              <button onClick={clearCart} className="text-[10px] font-bold text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-lg transition">Clear All</button>
            </div>

            {/* Cart Items Area */}
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2 custom-scrollbar bg-gray-50/10">
              {cart.length === 0 ? (
                <div className="py-20 flex flex-col items-center justify-center opacity-30">
                  <svg className="w-16 h-16 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z" />
                  </svg>
                  <p className="font-bold">Your cart is empty</p>
                </div>
              ) : (
                cart.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 py-1.5 border-b border-gray-100 last:border-0">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-gray-900 truncate leading-tight">{item.menu_name}</p>
                      <p className="text-[10px] text-blue-600 font-black mt-0.5">{mmkFormatter.format(item.price)}</p>
                    </div>
                    <div className="flex items-center gap-1.5 bg-white rounded-lg border border-gray-200 p-0.5 shadow-sm">
                      <button onClick={() => changeQty(item.id, -1)} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-gray-100 text-gray-600 transition">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M20 12H4" />
                        </svg>
                      </button>
                      <span className="w-6 text-center text-xs font-black text-gray-900">{item.qty}</span>
                      <button onClick={() => changeQty(item.id, 1)} className="w-7 h-7 flex items-center justify-center rounded-md hover:bg-blue-50 text-blue-600 transition">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                        </svg>
                      </button>
                    </div>
                    <button onClick={() => changeQty(item.id, -item.qty)} className="p-1.5 text-gray-300 hover:text-rose-500 transition-colors">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))
              )}
            </div>

            <div className="px-5 py-4 bg-white border-t space-y-4">
              {/* Discount & Payment Controls - MORE COMPACT */}
              <div className="space-y-3">
                <div className="flex gap-2 overflow-x-auto no-scrollbar pb-0.5">
                  <button onClick={() => { setSelectedDiscountType(null); setDiscount(0); }} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${!selectedDiscountType ? "bg-blue-600 text-white shadow-sm" : "bg-gray-100 text-gray-500"}`}>Manual</button>
                  {discountTypes.map((dt) => (
                    <button key={dt.id} onClick={() => { setSelectedDiscountType(dt); setDiscount(dt.discount_percent); }} className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${selectedDiscountType?.id === dt.id ? "bg-purple-600 text-white shadow-sm" : "bg-gray-100 text-gray-500"}`}>{dt.name}</button>
                  ))}
                </div>

                <div className="grid grid-cols-3 gap-1.5">
                  {["Cash", "Kpay", "FOC"].map((type) => (
                    <button key={type} onClick={() => { setPaymentType(type); if (type === "FOC") setDiscount(100); else if (paymentType === "FOC") setDiscount(0); }} className={`py-2 rounded-xl text-[10px] font-bold transition-all ${paymentType === type ? "bg-blue-600 text-white shadow-sm" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>{type}</button>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-gray-400">DISC %</span>
                    <input type="number" value={discount} onChange={(e) => { setDiscount(Math.min(100, Math.max(0, Number(e.target.value)))); setSelectedDiscountType(null); }} disabled={paymentType === "FOC"} className="w-full pl-12 pr-2 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-[9px] font-bold text-gray-400">TAX %</span>
                    <input type="number" value={tax} onChange={(e) => setTax(Math.min(100, Math.max(0, Number(e.target.value))))} className="w-full pl-10 pr-2 py-2 bg-gray-50 border border-gray-100 rounded-xl text-xs font-bold outline-none focus:ring-2 focus:ring-blue-500" />
                  </div>
                </div>

                <input type="text" value={remark} onChange={(e) => setRemark(e.target.value)} className="w-full px-4 py-2 bg-gray-50 border border-gray-100 rounded-xl text-[11px] font-medium outline-none focus:ring-2 focus:ring-blue-500" placeholder="Order remark (optional)..." />
              </div>

              {/* Totals & Action - COMPACTED */}
              <div className="pt-4 border-t space-y-3">
                <div className="space-y-1">
                  <div className="flex justify-between text-[11px] text-gray-500">
                    <span>Subtotal</span>
                    <span className="font-bold text-gray-700">{mmkFormatter.format(subtotal)}</span>
                  </div>
                  {discountAmount > 0 && (
                    <div className="flex justify-between text-[11px] text-rose-500">
                      <span>Discount ({discountPercent}%)</span>
                      <span className="font-bold">-{mmkFormatter.format(discountAmount)}</span>
                    </div>
                  )}
                  {taxAmount > 0 && (
                    <div className="flex justify-between text-[11px] text-emerald-500">
                      <span>Tax ({taxPercent}%)</span>
                      <span className="font-bold">+{mmkFormatter.format(taxAmount)}</span>
                    </div>
                  )}
                </div>
                
                <div className="bg-blue-600 p-4 rounded-2xl text-white shadow-lg shadow-blue-100 flex justify-between items-center">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-widest opacity-80">Grand Total</p>
                    <p className="text-2xl font-black">{mmkFormatter.format(total)}</p>
                  </div>
                  <button onClick={completeOrder} className="bg-white text-blue-600 px-5 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-blue-50 transition-all active:scale-95 shadow-sm">
                    Confirm
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
