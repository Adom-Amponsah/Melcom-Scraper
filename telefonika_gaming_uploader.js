import { createClient } from '@supabase/supabase-js'
import fs from 'fs/promises'
import path from 'path'

const supabaseUrl = 'https://rhhcxjijveqtldxjecme.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoaGN4amlqdmVxdGxkeGplY21lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg0MzQxOTIsImV4cCI6MjA1NDAxMDE5Mn0.7pLGIoYPMhFDpcCmFBNJ2lqL0YMoXpv12z0MxsOj-V0'
const supabase = createClient(supabaseUrl, supabaseKey)

async function cleanPrice(priceStr) {
  try {
    if (!priceStr) return 0
    const cleaned = priceStr
      .replace('₵', '')
      .replace(/,/g, '')
      .replace(/[^0-9.]/g, '')
      .trim()
    
    const price = parseFloat(cleaned)
    return isNaN(price) ? 0 : price
  } catch (error) {
    console.warn(`Warning: Could not parse price "${priceStr}", defaulting to 0`)
    return 0
  }
}

async function createGamingCategory(totalProducts) {
  const { error } = await supabase
    .from('categories')
    .upsert({
      name: 'GAMING',
      total_products: totalProducts,
      expected_count: totalProducts,
      last_updated: new Date().toISOString(),
      created_at: new Date().toISOString()
    }, {
      onConflict: 'name'
    })

  if (error) {
    throw new Error(`Error creating GAMING category: ${error.message}`)
  }
  
  console.log(`✓ Category created/updated: GAMING`)
}

async function uploadProducts(products, scrapedAt) {
  const batchSize = 50
  
  // Deduplicate products based on title
  const uniqueProducts = Object.values(products.reduce((acc, product) => {
    acc[product.title] = product
    return acc
  }, {}))
  
  console.log(`Found ${products.length} total products, ${uniqueProducts.length} unique products`)
  
  for (let i = 0; i < uniqueProducts.length; i += batchSize) {
    const batch = await Promise.all(
      uniqueProducts.slice(i, i + batchSize).map(async product => ({
        title: product.title || 'Unknown Title',
        price: await cleanPrice(product.price),
        image_url: product.image || null,
        product_url: product.url || null,
        category: 'GAMING', // Set category to GAMING
        last_updated: scrapedAt,
        created_at: new Date().toISOString()
      }))
    )

    try {
      const { error } = await supabase
        .from('products')
        .upsert(batch, {
          onConflict: 'title,category',
          ignoreDuplicates: true
        })

      if (error) {
        console.error(`Error uploading batch ${Math.floor(i/batchSize) + 1}:`, error)
        console.error('First item in problematic batch:', batch[0])
        continue
      }
      
      console.log(`✓ Uploaded batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(uniqueProducts.length/batchSize)}`)
    } catch (error) {
      console.error(`Failed to upload batch ${Math.floor(i/batchSize) + 1}:`, error)
      continue
    }
  }
}

async function uploadToSupabase() {
  try {
    const baseDir = './telefonika_files/gaming'
    const categories = await fs.readdir(baseDir)
    
    console.log('Starting database upload...')
    
    let totalProducts = 0
    let allProducts = []
    
    for (const categoryDir of categories) {
      const dirPath = path.join(baseDir, categoryDir)
      
      try {
        // Check if it's a directory
        const stats = await fs.stat(dirPath)
        if (!stats.isDirectory()) continue

        // Read the all_products.json file
        const allProductsPath = path.join(dirPath, 'all_products.json')
        const data = JSON.parse(await fs.readFile(allProductsPath, 'utf-8'))
        
        console.log(`\nProcessing ${data.category} (${data.products.length} products)`)
        
        totalProducts += data.products.length
        allProducts = [...allProducts, ...data.products]
        
      } catch (error) {
        console.error(`Error processing ${categoryDir}:`, error)
        continue
      }
    }
    
    // Create/Update GAMING category first
    await createGamingCategory(totalProducts)
    
    // Upload all products
    await uploadProducts(allProducts, new Date().toISOString())
    
    console.log(`\nCompleted upload: ${totalProducts} total products uploaded to GAMING category`)
    
  } catch (error) {
    console.error('Upload failed:', error)
  }
}

// Run the upload
uploadToSupabase().catch(console.error) 