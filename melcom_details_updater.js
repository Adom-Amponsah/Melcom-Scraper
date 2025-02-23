import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer'

const supabaseUrl = 'https://rhhcxjijveqtldxjecme.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoaGN4amlqdmVxdGxkeGplY21lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg0MzQxOTIsImV4cCI6MjA1NDAxMDE5Mn0.7pLGIoYPMhFDpcCmFBNJ2lqL0YMoXpv12z0MxsOj-V0'
const supabase = createClient(supabaseUrl, supabaseKey)

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function scrapeProductDetails(page) {
  console.log('Attempting to scrape product details...')
  
  return await page.evaluate(() => {
    console.log('Looking for description element...')
    const descriptionDiv = document.querySelector('.product.attribute.description .value')
    
    if (!descriptionDiv) {
      console.log('Description element not found')
      return null
    }

    const description = descriptionDiv.textContent?.trim()
    console.log('Description length:', description?.length || 0)

    if (!description) {
      console.log('Description is empty')
      return null
    }

    console.log('Description found:', description.substring(0, 100) + '...')
    return {
      details: description
    }
  })
}

async function updateProductInDB(product, details) {
  console.log('\nAttempting database update...')
  
  if (!details || !details.details) {
    console.log('No valid details to update')
    return
  }

  try {
    console.log('Updating product:', product.title)
    console.log('New details length:', details.details.length)
    
    const { error } = await supabase
      .from('products')
      .update({
        details: details.details,
        last_updated: new Date().toISOString()
      })
      .eq('id', product.id)

    if (error) {
      console.error('Update error:', error)
    } else {
      console.log('✓ Database update successful')
    }
  } catch (error) {
    console.error('Database operation error:', error)
  }
}

async function updateMelcomProductDetails() {
  try {
    console.log('Starting Melcom product details update...')
    
    // Get all Melcom products
    console.log('\nFetching Melcom products from database...')
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .ilike('product_url', '%melcom.com%')

    if (error) throw error

    console.log(`Found ${products.length} Melcom products to process`)

    console.log('\nInitializing browser...')
    const browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox']
    })
    
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })
    console.log('Browser initialized successfully')

    let successCount = 0
    let failCount = 0

    for (const product of products) {
      try {
        console.log(`\n----------------------------------------`)
        console.log(`Processing ${successCount + failCount + 1}/${products.length}:`)
        console.log(`Title: ${product.title}`)
        console.log(`URL: ${product.product_url}`)

        console.log('Navigating to product page...')
        await page.goto(product.product_url, { 
          waitUntil: 'networkidle0',
          timeout: 60000 
        })
        console.log('Page loaded successfully')

        const details = await scrapeProductDetails(page)
        
        if (details) {
          await updateProductInDB(product, details)
          successCount++
          console.log(`✓ Successfully processed: ${product.title}`)
        } else {
          failCount++
          console.log(`✗ Failed to get details for: ${product.title}`)
        }

        console.log('Waiting 2 seconds before next product...')
        await delay(2000)

      } catch (error) {
        failCount++
        console.error(`\nError processing ${product.title}:`)
        console.error('Error message:', error.message)
        console.error('Stack trace:', error.stack)
        continue
      }
    }

    console.log('\nClosing browser...')
    await browser.close()
    
    console.log('\n========== Update Summary ==========')
    console.log(`Total products processed: ${products.length}`)
    console.log(`Successfully updated: ${successCount} products`)
    console.log(`Failed to update: ${failCount} products`)
    console.log(`Success rate: ${((successCount/products.length) * 100).toFixed(1)}%`)
    console.log('===================================')

  } catch (error) {
    console.error('\nFatal error:', error)
    console.error('Stack trace:', error.stack)
  }
}

// Run the updater
console.log('Starting Melcom details updater...')
updateMelcomProductDetails()
  .catch(error => {
    console.error('Unhandled error:', error)
    process.exit(1)
  }) 