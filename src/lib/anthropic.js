// ============================================================================
// COMPREHENSIVE AI CLIENT - FULL DATABASE ACCESS
// All tables, all functions, all pages, all components
// ============================================================================
const API_BASE = '/api/ai';
import supabase from '../createClients.js';

const SYSTEM_PROMPT = `
=============================================================================
YOU ARE AN AI ASSISTANT WITH COMPLETE ACCESS TO THE ENTIRE POS SYSTEM DATABASE
=============================================================================

YOU HAVE DIRECT ACCESS TO ALL TABLES AND CAN ANSWER QUESTIONS ABOUT:

### PURCHASE GROUP ###
- purchases: Purchase orders (id, supplier_id, order_date, total_amount, status, paid, created_at)
- purchase_items: Items in each purchase (purchase_id, item_name, type, qty, unit_price, total)
- suppliers: Supplier information (id, name, phone, email, address, contact_person)
- purchase_return: Returned purchases
- supplier_outstanding: Outstanding payments to suppliers

### DISCOUNT ###
- discount_types: Discount configurations (id, name, percentage, amount, type)
- discount_type: Discount type settings

### HISTORY ###
- history: Order history records
- orders: All customer orders (id, table_number, total, status, payment_type, created_at)
- order_items: Items in each order (order_id, item_name, qty, price, total)
- internal_consumption: Internal usage records (id, purpose, status, total_amount)
- internal_consumption_items: Items consumed internally

### ALL REPORTS ###
- inventory: Stock levels, prices, categories
- menu: Menu items with prices
- menu_sets: Set combinations
- menu_ingredients: Recipe ingredients
- menu_set_items: Items in sets
- payments: All payment transactions
- categories: Item categories
- inventory_categories: Inventory categories

### CATEGORY ###
- categories: Product/service categories
- inventory_categories: Inventory item categories
- discount_type: Discount categories

### DASHBOARD DATA ###
- Real-time sales summary
- Today's orders
- Low stock alerts
- Revenue metrics
- Order statistics

### USER MANAGEMENT ###
- user: User accounts (id, username, role, permissions)
- user_rights: User permission settings

=============================================================================
ALWAYS USE THE ACTUAL DATABASE DATA TO PROVIDE ACCURATE, SPECIFIC ANSWERS
=============================================================================
`;

// ============================================================================
// FETCH FUNCTIONS - Access ANY table with ANY filter
// ============================================================================

export async function fetchFromTable(tableName, options = {}) {
  try {
    let query = supabase.from(tableName).select('*');

    if (options.limit) query = query.limit(options.limit);
    if (options.orderBy) query = query.order(options.orderBy, options.orderOptions || { ascending: false });
    if (options.filter) {
      for (const [key, value] of Object.entries(options.filter)) {
        query = query.eq(key, value);
      }
    }
    if (options.gte) {
      for (const [key, value] of Object.entries(options.gte)) {
        query = query.gte(key, value);
      }
    }
    if (options.lte) {
      for (const [key, value] of Object.entries(options.lte)) {
        query = query.lte(key, value);
      }
    }

    const { data, error } = await query;
    if (error) {
      console.error(`Error fetching ${tableName}:`, error.message);
      return [];
    }
    return data || [];
  } catch (error) {
    console.error(`Error fetching ${tableName}:`, error.message);
    return [];
  }
}

// ============================================================================
// COMPREHENSIVE DATA FETCHER - ALL TABLES
// ============================================================================

export async function fetchAllSystemData() {
  console.log('=== FETCHING COMPLETE DATABASE ===');

  const tableConfigs = {
    // ==================== PURCHASE GROUP ====================
    purchases: { limit: 500, orderBy: 'created_at', orderOptions: { ascending: false } },
    purchase_items: { limit: 2000 },
    purchase_return: { limit: 200, orderBy: 'created_at', orderOptions: { ascending: false } },
    suppliers: { limit: 200, orderBy: 'name' },
    supplier_outstanding: { limit: 500, orderBy: 'created_at', orderOptions: { ascending: false } },

    // ==================== DISCOUNT ====================
    discount_types: { limit: 100 },
    discount_type: { limit: 100 },

    // ==================== HISTORY ====================
    history: { limit: 500, orderBy: 'created_at', orderOptions: { ascending: false } },
    orders: { limit: 1000, orderBy: 'created_at', orderOptions: { ascending: false } },
    order_items: { limit: 5000 },
    internal_consumption: { limit: 500, orderBy: 'created_at', orderOptions: { ascending: false } },
    internal_consumption_items: { limit: 2000 },

    // ==================== INVENTORY & MENU ====================
    inventory: { limit: 1000, orderBy: 'id' },
    menu: { limit: 500, orderBy: 'id' },
    menu_sets: { limit: 200, orderBy: 'id' },
    menu_ingredients: { limit: 2000 },
    menu_set_items: { limit: 2000 },

    // ==================== CATEGORY ====================
    categories: { limit: 200, orderBy: 'name' },
    inventory_categories: { limit: 200, orderBy: 'name' },

    // ==================== PAYMENTS & REPORTS ====================
    payments: { limit: 1000, orderBy: 'created_at', orderOptions: { ascending: false } },

    // ==================== USER MANAGEMENT ====================
    user: { limit: 200 },
    user_rights: { limit: 1000 }
  };

  const results = {};

  for (const [table, config] of Object.entries(tableConfigs)) {
    results[table] = await fetchFromTable(table, config);
    console.log(`  ${table}: ${results[table].length} records`);
  }

  return results;
}

// ============================================================================
// BUSINESS METRICS CALCULATOR
// ============================================================================

function calculateMetrics(data) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  // Filter today's orders
  const todayOrders = data.orders?.filter(o => {
    const orderDate = new Date(o.created_at);
    return orderDate >= today && o.status === 'completed';
  }) || [];

  return {
    // Purchase Group Metrics
    purchase: {
      total_purchases: data.purchases?.length || 0,
      total_spent: data.purchases?.reduce((sum, p) => sum + (parseFloat(p.total_amount) || 0), 0) || 0,
      pending_purchases: data.purchases?.filter(p => p.status === 'pending').length || 0,
      received_purchases: data.purchases?.filter(p => p.status === 'received').length || 0,
      cancelled_purchases: data.purchases?.filter(p => p.status === 'cancelled').length || 0
    },

    // Supplier Metrics
    suppliers: {
      total_suppliers: data.suppliers?.length || 0,
      outstanding_count: data.supplier_outstanding?.length || 0,
      outstanding_total: data.supplier_outstanding?.reduce((sum, s) => sum + (parseFloat(s.amount) || 0), 0) || 0
    },

    // Discount Metrics
    discount: {
      total_types: data.discount_types?.length || 0,
      active_discounts: data.discount_types?.filter(d => d.percentage > 0 || d.amount > 0).length || 0
    },

    // History & Orders Metrics
    history: {
      total_orders: data.orders?.length || 0,
      completed_orders: data.orders?.filter(o => o.status === 'completed').length || 0,
      cancelled_orders: data.orders?.filter(o => o.status === 'cancelled').length || 0,
      pending_orders: data.orders?.filter(o => o.status === 'pending' || o.status === 'cooking').length || 0,
      today_orders: todayOrders.length,
      today_revenue: todayOrders.reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0) || 0,
      total_revenue: data.orders?.filter(o => o.status === 'completed').reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0) || 0
    },

    // Inventory Metrics
    inventory: {
      total_items: data.inventory?.length || 0,
      total_value: data.inventory?.reduce((sum, i) => sum + (parseFloat(i.price) || 0) * (parseFloat(i.qty) || 0), 0) || 0,
      low_stock: data.inventory?.filter(i => (i.qty || 0) < 10).length || 0,
      out_of_stock: data.inventory?.filter(i => (i.qty || 0) === 0).length || 0
    },

    // Menu Metrics
    menu: {
      total_items: data.menu?.length || 0,
      total_sets: data.menu_sets?.length || 0,
      total_categories: data.categories?.length || 0
    },

    // Internal Consumption
    internal_consumption: {
      total_records: data.internal_consumption?.length || 0,
      total_value: data.internal_consumption?.reduce((sum, c) => sum + (parseFloat(c.total_amount) || 0), 0) || 0
    },

    // User Metrics
    users: {
      total_users: data.user?.length || 0
    }
  };
}

// ============================================================================
// BUILD COMPREHENSIVE CONTEXT
// ============================================================================

function buildContext(data, metrics) {
  return `
╔══════════════════════════════════════════════════════════════════════════════╗
║                    COMPLETE REAL-TIME DATABASE SNAPSHOT                       ║
╚══════════════════════════════════════════════════════════════════════════════╝

┌─────────────────────────────────────────────────────────────────────────────┐
│ BUSINESS METRICS SUMMARY                                                     │
└─────────────────────────────────────────────────────────────────────────────┘
${JSON.stringify(metrics, null, 2)}

┌─────────────────────────────────────────────────────────────────────────────┐
│ PURCHASE GROUP DATA                                                          │
└─────────────────────────────────────────────────────────────────────────────┘

PURCHASES (${data.purchases.length} records):
${JSON.stringify(data.purchases)}

PURCHASE ITEMS (${data.purchase_items.length} records):
${JSON.stringify(data.purchase_items)}

SUPPLIERS (${data.suppliers.length} records):
${JSON.stringify(data.suppliers)}

PURCHASE RETURNS (${data.purchase_return?.length || 0} records):
${JSON.stringify(data.purchase_return || [])}

SUPPLIER OUTSTANDING (${data.supplier_outstanding?.length || 0} records):
${JSON.stringify(data.supplier_outstanding || [])}

┌─────────────────────────────────────────────────────────────────────────────┐
│ DISCOUNT DATA                                                                │
└─────────────────────────────────────────────────────────────────────────────┘

DISCOUNT TYPES (${data.discount_types.length} records):
${JSON.stringify(data.discount_types)}

DISCOUNT TYPE (${data.discount_type.length} records):
${JSON.stringify(data.discount_type)}

┌─────────────────────────────────────────────────────────────────────────────┐
│ HISTORY & ORDERS DATA                                                        │
└─────────────────────────────────────────────────────────────────────────────┘

ORDERS (${data.orders.length} records):
${JSON.stringify(data.orders)}

ORDER ITEMS (${data.order_items.length} records):
${JSON.stringify(data.order_items)}

HISTORY (${data.history.length} records):
${JSON.stringify(data.history)}

INTERNAL CONSUMPTION (${data.internal_consumption.length} records):
${JSON.stringify(data.internal_consumption)}

INTERNAL CONSUMPTION ITEMS (${data.internal_consumption_items.length} records):
${JSON.stringify(data.internal_consumption_items)}

┌─────────────────────────────────────────────────────────────────────────────┐
│ INVENTORY & MENU DATA                                                        │
└─────────────────────────────────────────────────────────────────────────────┘

INVENTORY (${data.inventory.length} records):
${JSON.stringify(data.inventory)}

MENU (${data.menu.length} records):
${JSON.stringify(data.menu)}

MENU SETS (${data.menu_sets.length} records):
${JSON.stringify(data.menu_sets)}

MENU INGREDIENTS (${data.menu_ingredients.length} records):
${JSON.stringify(data.menu_ingredients)}

MENU SET ITEMS (${data.menu_set_items.length} records):
${JSON.stringify(data.menu_set_items)}

┌─────────────────────────────────────────────────────────────────────────────┐
│ CATEGORY DATA                                                                │
└─────────────────────────────────────────────────────────────────────────────┘

CATEGORIES (${data.categories.length} records):
${JSON.stringify(data.categories)}

INVENTORY CATEGORIES (${data.inventory_categories.length} records):
${JSON.stringify(data.inventory_categories)}

┌─────────────────────────────────────────────────────────────────────────────┐
│ PAYMENTS DATA                                                                │
└─────────────────────────────────────────────────────────────────────────────┘

PAYMENTS (${data.payments.length} records):
${JSON.stringify(data.payments)}

┌─────────────────────────────────────────────────────────────────────────────┐
│ USER MANAGEMENT DATA                                                         │
└─────────────────────────────────────────────────────────────────────────────┘

USERS (${data.user.length} records):
${JSON.stringify(data.user)}

USER RIGHTS (${data.user_rights.length} records):
${JSON.stringify(data.user_rights)}
`;
}

// ============================================================================
// MAIN CHAT FUNCTION
// ============================================================================

export async function chatWithAI(message, conversationHistory = []) {
  try {
    console.log('=== AI Chat Request ===');
    console.log('User:', message);

    // Fetch ALL data
    const allData = await fetchAllSystemData();
    const metrics = calculateMetrics(allData);
    const context = buildContext(allData, metrics);

    console.log('Data fetched, sending to AI...');

    const messages = [
      { role: 'system', content: SYSTEM_PROMPT + '\n\n' + context },
      ...conversationHistory,
      { role: 'user', content: message }
    ];

    const response = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        messages: messages,
        max_tokens: 8192
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    // Parse streaming response
    const text = await response.text();
    const lines = text.split('\n').filter(line => line.trim());

    let fullContent = '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const dataStr = line.slice(6);
        if (dataStr.trim() === '[DONE]') continue;
        try {
          const data = JSON.parse(dataStr);
          const delta = data.choices?.[0]?.delta;
          if (delta?.content) fullContent += delta.content;
        } catch (e) { /* Skip invalid JSON */ }
      }
    }

    console.log('AI Response received');
    return { success: true, response: fullContent || 'No response from AI' };

  } catch (error) {
    console.error('AI Chat Error:', error);
    return { success: false, error: error.message || 'Failed to get AI response' };
  }
}

// ============================================================================
// ANALYSIS FUNCTION
// ============================================================================

export async function analyzeData(analysisRequest) {
  try {
    const { question, dataType } = analysisRequest || {};

    // Fetch ALL data
    const allData = await fetchAllSystemData();
    const metrics = calculateMetrics(allData);

    const prompt = `
Question: ${question || 'Provide a comprehensive business analysis'}
Focus Area: ${dataType || 'all'}

${buildContext(allData, metrics)}

Provide a detailed analysis including:
1. Executive Summary
2. Key Findings
3. Trends and Patterns
4. Areas of Concern
5. Recommendations
6. Actionable Insights
`;

    const messages = [
      { role: 'system', content: 'You are a senior business intelligence analyst. Provide comprehensive, data-driven analysis with specific numbers and actionable recommendations.' },
      { role: 'user', content: prompt }
    ];

    const response = await fetch(`${API_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        messages: messages,
        max_tokens: 8192
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`API Error: ${response.status} - ${errorText}`);
    }

    const text = await response.text();
    const lines = text.split('\n').filter(line => line.trim());

    let fullContent = '';
    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const dataStr = line.slice(6);
        if (dataStr.trim() === '[DONE]') continue;
        try {
          const data = JSON.parse(dataStr);
          const delta = data.choices?.[0]?.delta;
          if (delta?.content) fullContent += delta.content;
        } catch (e) { /* Skip invalid JSON */ }
      }
    }

    return { success: true, analysis: fullContent };

  } catch (error) {
    console.error('AI Analysis Error:', error);
    return { success: false, error: error.message || 'Failed to analyze data' };
  }
}

// ============================================================================
// SPECIALIZED QUERY FUNCTIONS
// ============================================================================

// Get purchase data with supplier info
export async function getPurchaseData() {
  const purchases = await fetchFromTable('purchases', { orderBy: 'created_at', orderOptions: { ascending: false } });
  const suppliers = await fetchFromTable('suppliers');
  const purchaseItems = await fetchFromTable('purchase_items');

  return { purchases, suppliers, purchaseItems };
}

// Get discount data
export async function getDiscountData() {
  const discountTypes = await fetchFromTable('discount_types');
  const discountType = await fetchFromTable('discount_type');
  return { discountTypes, discountType };
}

// Get history data
export async function getHistoryData(options = {}) {
  const orders = await fetchFromTable('orders', {
    orderBy: 'created_at',
    orderOptions: { ascending: false },
    limit: options.limit || 500
  });
  const orderItems = await fetchFromTable('order_items');
  const history = await fetchFromTable('history', {
    orderBy: 'created_at',
    orderOptions: { ascending: false }
  });

  return { orders, orderItems, history };
}

// Get all report data
export async function getReportData() {
  const inventory = await fetchFromTable('inventory');
  const menu = await fetchFromTable('menu');
  const payments = await fetchFromTable('payments', { orderBy: 'created_at', orderOptions: { ascending: false } });
  const categories = await fetchFromTable('categories');

  return { inventory, menu, payments, categories };
}

// Get dashboard data
export async function getDashboardData() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const orders = await fetchFromTable('orders', { orderBy: 'created_at', orderOptions: { ascending: false } });
  const inventory = await fetchFromTable('inventory');
  const menu = await fetchFromTable('menu');
  const suppliers = await fetchFromTable('suppliers');

  // Calculate today's stats
  const todayOrders = orders.filter(o => {
    const orderDate = new Date(o.created_at);
    return orderDate >= today;
  });

  const todayRevenue = todayOrders
    .filter(o => o.status === 'completed')
    .reduce((sum, o) => sum + (parseFloat(o.total) || 0), 0);

  const lowStockItems = inventory.filter(i => (i.qty || 0) < 10);

  return {
    orders,
    inventory,
    menu,
    suppliers,
    todayOrders: todayOrders.length,
    todayRevenue,
    lowStockItems: lowStockItems.length,
    lowStockItemsList: lowStockItems
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

export default {
  messages: { create: chatWithAI },
  chatWithAI,
  analyzeData,
  fetchFromTable,
  fetchAllSystemData,
  calculateMetrics,
  getPurchaseData,
  getDiscountData,
  getHistoryData,
  getReportData,
  getDashboardData
};
