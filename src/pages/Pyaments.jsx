import { useEffect, useState, useMemo } from "react";
import Swal from "sweetalert2";
import supabase from "../createClients";

export default function Pyaments({ inventory, setInventory, user }) {
  const [menu, setMenu] = useState([]);
  const [menuSets, setMenuSets] = useState([]);
  const [categories, setCategories] = useState([]);
  const [ingredientsMap, setIngredientsMap] = useState({});
  const [menuSetItemsMap, setMenuSetItemsMap] = useState({});
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
        isSet: false,
      }));
      setMenu(merged);

      // Fetch menu sets
      const { data: setsData, error: setsErr } = await supabase
        .from("menu_sets")
        .select("*");
      if (setsErr) throw setsErr;

      const { data: setItemsData, error: setItemsErr } = await supabase
        .from("menu_set_items")
        .select("*");
      if (setItemsErr) throw setItemsErr;

      const setItemsMap = {};
      setItemsData.forEach((item) => {
        if (!setItemsMap[item.set_id]) setItemsMap[item.set_id] = [];
        setItemsMap[item.set_id].push(item);
      });
      setMenuSetItemsMap(setItemsMap);

      const mergedSets = setsData.map((s) => ({
        ...s,
        menu_name: s.set_name,
        menu_items: setItemsMap[s.id] || [],
        isSet: true,
      }));
      setMenuSets(mergedSets);
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to load menu", "error");
      setMenu([]);
      setMenuSets([]);
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
    () => {
      const allItems = [...menu, ...menuSets];
      return allItems.filter((m) => {
        const matchesSearch = (m.menu_name || "").toLowerCase().includes(search.toLowerCase());
        const matchesCategory = selectedCategory === "all" || m.category_id === Number(selectedCategory);
        return matchesSearch && matchesCategory;
      });
    },
    [menu, menuSets, search, selectedCategory],
  );

  const addToCart = (item) => {
    if (item.isSet) {
      // Handle menu set
      const setItems = menuSetItemsMap[item.id] || [];
      let maxQty = Infinity;

      // Check stock for all menu items in the set
      for (const setItem of setItems) {
        const menuItem = menu.find(m => m.id === setItem.menu_id);
        if (!menuItem) continue;

        const ingredients = ingredientsMap[menuItem.id] || [];
        for (const ing of ingredients) {
          const inv = safeInventory.find((i) => i.id === ing.inventory_id);
          const stock = inv ? Math.floor(inv.qty / ing.qty) : 0;
          if (stock < maxQty) maxQty = stock;
        }
      }

      setCart((prev) => {
        const exist = prev.find((c) => c.id === item.id && c.isSet === item.isSet);
        if (exist) {
          if (exist.qty >= maxQty && maxQty > 0) {
            Swal.fire(
              "Stock Limit",
              `Cannot add more ${item.menu_name}`,
              "warning",
            );
            return prev;
          }
          return prev.map((c) =>
            c.id === item.id && c.isSet === item.isSet ? { ...c, qty: c.qty + 1 } : c,
          );
        }
        return [...prev, { ...item, qty: 1 }];
      });
    } else {
      // Handle regular menu item
      const ingredients = ingredientsMap[item.id] || [];
      let maxQty = Infinity;

      for (const ing of ingredients) {
        const inv = safeInventory.find((i) => i.id === ing.inventory_id);
        const stock = inv ? Math.floor(inv.qty / ing.qty) : 0;
        if (stock < maxQty) maxQty = stock;
      }

      setCart((prev) => {
        const exist = prev.find((c) => c.id === item.id && !c.isSet);
        if (exist) {
          if (exist.qty >= maxQty && maxQty > 0) {
            Swal.fire(
              "Stock Limit",
              `Cannot add more ${item.menu_name}`,
              "warning",
            );
            return prev;
          }
          return prev.map((c) =>
            c.id === item.id && !c.isSet ? { ...c, qty: c.qty + 1 } : c,
          );
        }
        return [...prev, { ...item, qty: 1 }];
      });
    }
  };

  const changeQty = (id, diff, isSet) => {
    setCart((prev) =>
      prev
        .map((c) => {
          if (c.id === id && c.isSet === isSet) {
            const newQty = c.qty + diff;
            if (newQty <= 0) return null;
            // Allow any quantity - no stock limit alerts
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
      return Swal.fire("Cart Empty", "Add items first", "warning");

    try {
      const updatedInventory = safeInventory.map((i) => ({ ...i }));

      // Allow negative inventory - no stock check
      // for (const item of cart) {
      //   if (item.isSet) {
      //     const setItems = menuSetItemsMap[item.id] || [];
      //     for (const setItem of setItems) {
      //       const menuItem = menu.find(m => m.id === setItem.menu_id);
      //       if (!menuItem) continue;
      //       const ingredients = ingredientsMap[menuItem.id] || [];
      //       for (const ing of ingredients) {
      //         const inv = updatedInventory.find((i) => i.id === ing.inventory_id);
      //         if (!inv || inv.qty < ing.qty * item.qty) {
      //           throw new Error(`Not enough ${inv?.item_name || "Unknown"} for ${item.menu_name}`);
      //         }
      //       }
      //     }
      //   } else {
      //     const ingredients = ingredientsMap[item.id] || [];
      //     for (const ing of ingredients) {
      //       const inv = updatedInventory.find((i) => i.id === ing.inventory_id);
      //       if (!inv || inv.qty < ing.qty * item.qty) {
      //         throw new Error(`Not enough ${inv?.item_name || "Unknown"} for ${item.menu_name}`);
      //       }
      //     }
      //   }
      // }

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

      // Insert order items only.
      // Inventory will be deducted when order is marked completed in History page.
      for (const item of cart) {
        if (item.isSet) {
          // Insert menu set as order item
          await supabase.from("order_items").insert({
            order_id: order.id,
            menu_id: null,
            menu_set_id: item.id,
            qty: item.qty,
            price: item.price,
          });
        } else {
          // Insert regular menu item
          await supabase.from("order_items").insert({
            order_id: order.id,
            menu_id: item.id,
            menu_set_id: null,
            qty: item.qty,
            price: item.price,
          });
        }
      }

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
                ${cart
                  .map(
                    (i) => `<tr>
                  <td>${i.menu_name}${i.isSet ? ' (Set)' : ''}</td>
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
      Swal.fire("Success", "Order printed successfully!", "success");
      fetchMenu();
    } catch (err) {
      Swal.fire("Error", err.message || "Failed to create order", "error");
    }
  };

  return (
    <div className="min-h-screen p-6 bg-gray-100 grid grid-cols-1 lg:grid-cols-7 gap-8">
      {/* Menu */}
      <div className="bg-white rounded-2xl shadow-md p-6 lg:col-span-4">
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
              key={`${item.id}-${item.isSet ? 'set' : 'menu'}`}
              onClick={() => addToCart(item)}
              className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg"
            >
              <div className="pointer-events-none absolute right-3 top-3 rounded-full bg-emerald-600 px-3 py-1 text-xs font-bold text-white shadow">
                {mmkFormatter.format(item.price)}
              </div>

              <div className="absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r from-sky-500 via-indigo-500 to-emerald-500" />

              <div className="pr-24 pt-2">
                <p className="font-semibold text-slate-900 leading-tight">
                  {item.menu_name}
                </p>
                <div className="mt-2">
                  {item.isSet ? (
                    <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-700">
                      Menu Set
                    </span>
                  ) : (
                    <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                      Menu
                    </span>
                  )}
                </div>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Cart */}
      <div className="bg-white rounded-2xl shadow-md p-6 lg:col-span-3">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-3xl font-bold">Cart</h2>
          <span className="rounded-full bg-indigo-100 px-3 py-1 text-xs font-semibold text-indigo-700">
            {cart.length} item{cart.length === 1 ? "" : "s"}
          </span>
        </div>
        {cart.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-10 text-center text-slate-400">
            Your cart is empty
          </div>
        ) : (
          <div className="max-h-72 space-y-3 overflow-y-auto pr-1">
            {cart.map((item) => (
              <div
                key={`${item.id}-${item.isSet ? 'set' : 'menu'}`}
                className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-800 p-4"
              >
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {item.menu_name}
                      {item.isSet && <span className="ml-2 rounded bg-violet-100 px-2 py-0.5 text-xs text-violet-700">SET</span>}
                    </p>
                    <p className="mt-1 text-xs text-slate-500">
                      {mmkFormatter.format(item.price)} each
                    </p>
                  </div>
                  <p className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-bold text-emerald-700">
                    {mmkFormatter.format(item.price * item.qty)}
                  </p>
                </div>

                <div className="flex items-center justify-between">
                  <div className="inline-flex items-center rounded-xl border border-slate-300 bg-white">
                    <button
                      onClick={() => changeQty(item.id, -1, item.isSet)}
                      className="px-3 py-1.5 text-lg font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      −
                    </button>
                    <span className="min-w-10 px-2 text-center text-sm font-semibold text-slate-800">
                      {item.qty}
                    </span>
                    <button
                      onClick={() => changeQty(item.id, 1, item.isSet)}
                      className="px-3 py-1.5 text-lg font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      +
                    </button>
                  </div>

                  <button
                    onClick={() => changeQty(item.id, -item.qty, item.isSet)}
                    className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                  >
                    Remove
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Discount Form */}
        <div className="mt-4 border-t pt-4">
          {discountTypes.length > 0 && (
            <>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Discount Type
              </label>
              <div className="flex flex-wrap gap-2 mb-3">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedDiscountType(null);
                    setDiscount(0);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                    !selectedDiscountType
                      ? "bg-blue-600 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  Manual
                </button>
                {discountTypes.map((dt) => (
                  <button
                    key={dt.id}
                    type="button"
                    onClick={() => {
                      setSelectedDiscountType(dt);
                      setDiscount(dt.discount_percent);
                    }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                      selectedDiscountType?.id === dt.id
                        ? "bg-purple-600 text-white"
                        : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                  >
                    {dt.name} ({dt.discount_percent}%)
                  </button>
                ))}
              </div>
            </>
          )}
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Discount (%)
          </label>
          <input
            type="text"
            inputMode="numeric"
            min="0"
            max="100"
            value={discount}
            onChange={(e) => {
              setDiscount(Math.min(100, Math.max(0, Number(e.target.value))));
              setSelectedDiscountType(null);
            }}
            className="w-full p-2 border rounded-xl"
            placeholder="Enter discount %"
            disabled={paymentType === "FOC"}
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
              onClick={() => {
                setPaymentType("Kpay");
                setDiscount(0);
              }}
              className={`flex-1 py-3 rounded-xl font-medium transition ${
                paymentType === "Kpay"
                  ? "bg-blue-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Kpay
            </button>
            <button
              onClick={() => {
                setPaymentType("Cash");
                setDiscount(0);
              }}
              className={`flex-1 py-3 rounded-xl font-medium transition ${
                paymentType === "Cash"
                  ? "bg-green-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              Cash
            </button>
            <button
              onClick={() => {
                setPaymentType("FOC");
                setDiscount(100);
              }}
              className={`flex-1 py-3 rounded-xl font-medium transition ${
                paymentType === "FOC"
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
              }`}
            >
              FOC
            </button>
          </div>
        </div>

        {/* Remark Input */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Remark
          </label>
          <input
            type="text"
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            className="w-full p-2 border rounded-xl"
            placeholder="Enter remark..."
          />
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
