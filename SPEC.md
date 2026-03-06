# POS System - Category Feature Specification

## Project Overview
- **Project Name**: POS (Point of Sale) System
- **Type**: Web Application (React + Supabase)
- **Core Functionality**: Category management for menu items with CRUD operations and menu filtering
- **Target Users**: Restaurant staff (superadmin, admin, chef roles)

---

## UI/UX Specification

### Layout Structure

#### Sidebar
- Category link already exists in sidebar navigation
- Accessible to: superadmin, admin, chef roles
- Navigation path: `/category`

#### Pages
1. **Category Page** (`/category`)
   - Search bar at top
   - "Add Category" button on right
   - Grid layout for category cards (1 col mobile, 2 col tablet, 3 col desktop)

2. **Menu Page** (`/menu`)
   - Search bar at top
   - "Add Menu" button on right
   - Category filter tabs below search
   - Grid layout for menu cards

### Visual Design
- **Color Palette**:
  - Primary: Blue-600 (#2563EB)
  - Success: Green-600 (#16A34A)
  - Danger: (#EF Red-5004444)
  - Background: Gray-100 (#F3F4F6)
  - Card Background: White (#FFFFFF)

- **Typography**:
  - Headings: Bold, text-gray-800
  - Body: Regular, text-gray-500/600

- **Spacing**:
  - Page padding: 24px (p-6)
  - Card gap: 24px (gap-6)
  - Card padding: 20px (p-5)

- **Components**:
  - Buttons: Rounded-2xl, shadow, hover transitions
  - Inputs: Border, rounded-2xl, focus ring
  - Modals: Fixed overlay, centered, max-height scrollable

---

## Functionality Specification

### Category Management (Category.jsx)

#### Features
1. **List Categories**
   - Fetch all categories from `categories` table
   - Display in responsive grid
   - Show: name, description, ID

2. **Search Categories**
   - Filter by name in real-time

3. **Create Category**
   - Modal form with name (required) and description (optional)
   - Insert into `categories` table

4. **Edit Category**
   - Pre-fill modal with existing data
   - Update `categories` table

5. **Delete Category**
   - Confirmation dialog
   - Set related menu items category_id to null
   - Delete from `categories` table

### Menu Category Integration (Menu.jsx)

#### Features
1. **Category Filter Tabs**
   - "All" tab (default)
   - Dynamic tabs from categories table
   - Active tab highlighted blue

2. **Category Selection in Form**
   - Dropdown in add/edit menu modal
   - Optional selection (can be empty)

3. **Category Display on Cards**
   - Show category name below price
   - Handle uncategorized items gracefully

---

## Database Schema

### Table: categories
| Column | Type | Constraints |
|--------|------|-------------|
| id | bigint | primary key |
| name | text | not null |
| description | text | nullable |
| created_at | timestamp | default now |

---

## Acceptance Criteria

### Category Page
- [ ] Can view all categories in grid
- [ ] Can search categories by name
- [ ] Can add new category with name
- [ ] Can edit existing category
- [ ] Can delete category (menu items unaffected)
- [ ] Modal opens/closes properly

### Menu Page
- [ ] Category filter tabs display correctly
- [ ] Can filter menu by category
- [ ] Can assign category when creating menu
- [ ] Can change category when editing menu
- [ ] Category name displays on menu card

### Sidebar
- [ ] Category link visible for allowed roles
- [ ] Navigation to /category works

---

## File Changes

### Modified Files
- `src/pages/Menu.jsx` - Added category filter tabs, category dropdown, category display
- `src/components/Sidebar.jsx` - Already has Category link
- `src/pages/Category.jsx` - Already has full CRUD

### Created Files
- `SPEC.md` - This specification
