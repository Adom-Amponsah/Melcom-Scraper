// db-fetcher.js
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://rhhcxjijveqtldxjecme.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoaGN4amlqdmVxdGxkeGplY21lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg0MzQxOTIsImV4cCI6MjA1NDAxMDE5Mn0.7pLGIoYPMhFDpcCmFBNJ2lqL0YMoXpv12z0MxsOj-V0'
const supabase = createClient(supabaseUrl, supabaseKey)

async function getAllCategories() {
  const { data, error } = await supabase
    .from('categories')
    .select('*')
    .order('name')
  
  if (error) {
    console.error('Error fetching categories:', error)
    return
  }
  
  console.log('\nAll Categories:')
  console.table(data)
}

async function getCategoryStats() {
  const { data, error } = await supabase
    .from('products')
    .select('category, price')
  
  if (error) {
    console.error('Error fetching products:', error)
    return
  }
  
  // Calculate stats per category
  const stats = data.reduce((acc, product) => {
    if (!acc[product.category]) {
      acc[product.category] = {
        count: 0,
        total: 0,
        min: Infinity,
        max: -Infinity
      }
    }
    
    acc[product.category].count++
    acc[product.category].total += product.price
    acc[product.category].min = Math.min(acc[product.category].min, product.price)
    acc[product.category].max = Math.max(acc[product.category].max, product.price)
    
    return acc
  }, {})
  
  // Calculate averages and format
  Object.keys(stats).forEach(category => {
    stats[category].avg = (stats[category].total / stats[category].count).toFixed(2)
    stats[category].min = stats[category].min.toFixed(2)
    stats[category].max = stats[category].max.toFixed(2)
    delete stats[category].total
  })
  
  console.log('\nCategory Statistics:')
  console.table(stats)
}

async function getProductsByCategory(category, limit = 5) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .eq('category', category)
    .order('price', { ascending: false })
    .limit(limit)
  
  if (error) {
    console.error(`Error fetching products for ${category}:`, error)
    return
  }
  
  console.log(`\nTop ${limit} Most Expensive Products in ${category}:`)
  console.table(data.map(p => ({
    title: p.title,
    price: p.price,
    url: p.product_url
  })))
}

async function searchProducts(query) {
  const { data, error } = await supabase
    .from('products')
    .select('*')
    .ilike('title', `%${query}%`)
    .order('price', { ascending: false })
    .limit(10)
  
  if (error) {
    console.error('Error searching products:', error)
    return
  }
  
  console.log(`\nSearch Results for "${query}":`)
  console.table(data.map(p => ({
    category: p.category,
    title: p.title,
    price: p.price
  })))
}

// Run tests
async function runTests() {
  console.log('Testing Database Queries...')
  
  // Get all categories and their counts
  await getAllCategories()
  
  // Get statistics for each category
  await getCategoryStats()
  
  // Get most expensive products from a few categories
  await getProductsByCategory('SUPERMARKET')
  await getProductsByCategory('ELECTRICAL APPLIANCES')
  
  // Search for some products
  await searchProducts('iphone')
  await searchProducts('samsung')
}

runTests().catch(console.error)