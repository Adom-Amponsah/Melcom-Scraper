// db-uploader.js
import { createClient } from '@supabase/supabase-js'
import fs from 'fs/promises'
import path from 'path'

const supabaseUrl = 'https://rhhcxjijveqtldxjecme.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoaGN4amlqdmVxdGxkeGplY21lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg0MzQxOTIsImV4cCI6MjA1NDAxMDE5Mn0.7pLGIoYPMhFDpcCmFBNJ2lqL0YMoXpv12z0MxsOj-V0'
const supabase = createClient(supabaseUrl, supabaseKey)

async function cleanPrice(priceStr) {
  try {
    // Handle undefined or null price
    if (!priceStr) return 0;
    
    // Remove currency symbol (GH₵), commas, and any other non-numeric characters except decimal point
    const cleaned = priceStr
      .replace('GH₵', '')
      .replace(/,/g, '')
      .replace(/[^0-9.]/g, '')
      .trim();
    
    // Convert to float and handle invalid numbers
    const price = parseFloat(cleaned);
    return isNaN(price) ? 0 : price;
  } catch (error) {
    console.warn(`Warning: Could not parse price "${priceStr}", defaulting to 0`);
    return 0;
  }
}

async function uploadCategory(categoryData) {
  const { error } = await supabase
    .from('categories')
    .upsert({
      name: categoryData.category,
      total_products: categoryData.actualCount,
      expected_count: categoryData.expectedCount,
      last_updated: categoryData.scrapedAt
    }, {
      onConflict: 'name'
    })

  if (error) {
    throw new Error(`Error uploading category ${categoryData.category}: ${error.message}`)
  }
  
  console.log(`✓ Category uploaded: ${categoryData.category}`)
}

async function uploadProducts(products, categoryName, scrapedAt) {
  const batchSize = 50
  
  // First, deduplicate products based on title
  const uniqueProducts = Object.values(products.reduce((acc, product) => {
    acc[product.title] = product; // Keep last occurrence of each product
    return acc;
  }, {}));
  
  console.log(`Found ${products.length} total products, ${uniqueProducts.length} unique products`)
  
  for (let i = 0; i < uniqueProducts.length; i += batchSize) {
    const batch = uniqueProducts.slice(i, i + batchSize).map(async product => {
      const price = await cleanPrice(product.price);
      return {
        title: product.title || 'Unknown Title',
        price: price,
        image_url: product.image || null,
        product_url: product.url || null,
        category: categoryName,
        last_updated: scrapedAt
      };
    });

    // Wait for all price cleaning promises to resolve
    const cleanedBatch = await Promise.all(batch);

    try {
      const { error } = await supabase
        .from('products')
        .upsert(cleanedBatch, {
          onConflict: 'title,category',
          ignoreDuplicates: true // Add this option
        });

      if (error) {
        console.error(`Error uploading batch ${Math.floor(i/batchSize) + 1}:`, error);
        console.error('First item in problematic batch:', cleanedBatch[0]);
        continue;
      }
      
      console.log(`✓ Uploaded batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(uniqueProducts.length/batchSize)} for ${categoryName}`);
    } catch (error) {
      console.error(`Failed to upload batch ${Math.floor(i/batchSize) + 1}:`, error);
      continue;
    }
  }
}

async function uploadToSupabase() {
  try {
    const baseDir = './html_files'
    const categories = await fs.readdir(baseDir)
    
    console.log('Starting database upload...')
    
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
        
        // Upload category first
        await uploadCategory(data)
        
        // Then upload all products for this category
        await uploadProducts(data.products, data.category, data.scrapedAt)
        
        console.log(`✓ Completed ${data.category}: ${data.products.length} products uploaded`)
        
      } catch (error) {
        console.error(`Error processing ${categoryDir}:`, error)
        continue
      }
    }
    
    console.log('\nDatabase upload completed successfully!')
    
  } catch (error) {
    console.error('Upload failed:', error)
  }
}

// Run the upload
uploadToSupabase().catch(console.error)