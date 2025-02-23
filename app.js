import { createClient } from 'https://esm.sh/@supabase/supabase-js'

const supabaseUrl = 'https://rhhcxjijveqtldxjecme.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoaGN4amlqdmVxdGxkeGplY21lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg0MzQxOTIsImV4cCI6MjA1NDAxMDE5Mn0.7pLGIoYPMhFDpcCmFBNJ2lqL0YMoXpv12z0MxsOj-V0'
const supabase = createClient(supabaseUrl, supabaseKey)

// State management
let currentState = {
    page: 1,
    limit: 10,
    category: '',
    search: ''
}

// Initialize the application
async function init() {
    await loadCategories()
    setupEventListeners()
    loadProducts()
}

// Load categories into the filter dropdown
async function loadCategories() {
    const { data: categories, error } = await supabase
        .from('categories')
        .select('*')
        .order('name')

    if (error) {
        console.error('Error loading categories:', error)
        return
    }

    const categorySelect = document.getElementById('categorySelect')
    const filterCategory = document.getElementById('filterCategory')
    
    categories.forEach(category => {
        // Add to upload form select
        const option1 = document.createElement('option')
        option1.value = category.name
        option1.textContent = category.name
        categorySelect.appendChild(option1)

        // Add to filter select
        const option2 = option1.cloneNode(true)
        filterCategory.appendChild(option2)
    })
}

// Set up event listeners
function setupEventListeners() {
    // Upload form submission
    document.getElementById('uploadForm').addEventListener('submit', async (e) => {
        e.preventDefault()
        
        const product = {
            title: document.getElementById('productTitle').value,
            category: document.getElementById('categorySelect').value,
            price: parseFloat(document.getElementById('productPrice').value),
            image_url: document.getElementById('productImage').value,
            product_url: document.getElementById('productUrl').value,
            last_updated: new Date().toISOString()
        }

        const { error } = await supabase
            .from('products')
            .insert([product])

        if (error) {
            alert('Error uploading product: ' + error.message)
        } else {
            alert('Product uploaded successfully!')
            e.target.reset()
            loadProducts()
        }
    })

    // Filter and search
    document.getElementById('filterCategory').addEventListener('change', (e) => {
        currentState.category = e.target.value
        currentState.page = 1
        loadProducts()
    })

    document.getElementById('searchInput').addEventListener('input', (e) => {
        currentState.search = e.target.value
        currentState.page = 1
        loadProducts()
    })
}

// Load products based on current state
async function loadProducts() {
    let query = supabase
        .from('products')
        .select('*', { count: 'exact' })

    if (currentState.category) {
        query = query.eq('category', currentState.category)
    }
    if (currentState.search) {
        query = query.ilike('title', `%${currentState.search}%`)
    }

    const from = (currentState.page - 1) * currentState.limit
    const to = from + currentState.limit - 1
    query = query.range(from, to)
    query = query.order('created_at', { ascending: false })

    const { data: products, error, count } = await query

    if (error) {
        console.error('Error loading products:', error)
        return
    }

    displayProducts(products)
    updatePagination(count)
}

// Display products in the grid
function displayProducts(products) {
    const tbody = document.getElementById('productsTable')
    tbody.innerHTML = ''

    products.forEach(product => {
        const tr = document.createElement('tr')
        tr.innerHTML = `
            <td>${product.title}</td>
            <td><span class="badge bg-primary">${product.category}</span></td>
            <td>GH₵ ${product.price.toFixed(2)}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deleteProduct('${product.id}')">Delete</button>
            </td>
        `
        tbody.appendChild(tr)
    })
}

// Update pagination controls
function updatePagination(totalCount) {
    const totalPages = Math.ceil(totalCount / currentState.limit)
    const pagination = document.getElementById('pagination')
    
    pagination.innerHTML = `
        <div>
            Showing ${(currentState.page - 1) * currentState.limit + 1} to 
            ${Math.min(currentState.page * currentState.limit, totalCount)} of ${totalCount} products
        </div>
        <div class="btn-group">
            ${Array.from({ length: totalPages }, (_, i) => i + 1)
                .map(num => `
                    <button class="btn btn-${currentState.page === num ? 'primary' : 'outline-primary'}"
                            onclick="changePage(${num})">${num}</button>
                `).join('')}
        </div>
    `
}

// Make these functions available globally
window.changePage = (page) => {
    currentState.page = page
    loadProducts()
}

window.deleteProduct = async (id) => {
    if (confirm('Are you sure you want to delete this product?')) {
        const { error } = await supabase
            .from('products')
            .delete()
            .eq('id', id)

        if (error) {
            alert('Error deleting product: ' + error.message)
        } else {
            loadProducts()
        }
    }
}

// Initialize the app
init() 