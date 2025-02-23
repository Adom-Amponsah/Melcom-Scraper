import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer'

const supabaseUrl = 'https://rhhcxjijveqtldxjecme.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoaGN4amlqdmVxdGxkeGplY21lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg0MzQxOTIsImV4cCI6MjA1NDAxMDE5Mn0.7pLGIoYPMhFDpcCmFBNJ2lqL0YMoXpv12z0MxsOj-V0'
const supabase = createClient(supabaseUrl, supabaseKey)

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function scrapeProductDetails(page) {
  return await page.evaluate(() => {
    // Get the short description first
    const shortDesc = document.querySelector('.woocommerce-product-details__short-description')?.textContent?.trim()
    
    // If no short description, try getting the tab description
    const tabDesc = document.querySelector('#tab-description .panel-body')?.textContent?.trim()
    
    // Log what we found for debugging
    console.log('Short Description:', shortDesc)
    console.log('Tab Description:', tabDesc)
    
    return {
      details: shortDesc || tabDesc || null
    }
  })
}

async function constructProductUrl(title) {
  // Convert title to URL-friendly format
  const urlTitle = title.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-') // Replace non-alphanumeric with hyphens
    .replace(/^-+|-+$/g, '') // Remove leading/trailing hyphens
  
  return `https://www.beautyexpressgh.com/product/${urlTitle}/`
}

async function verifyUpdate(productId) {
  const { data, error } = await supabase
    .from('products')
    .select('id, title, details')
    .eq('id', productId)
    .single()

  if (error) {
    console.error('Error verifying update:', error)
    return false
  }

  console.log('\nVerifying update for product:', data.title)
  console.log('Details in database:', data.details)
  
  return data.details !== null
}

async function updateProductDetails(product, details) {
  // First check if product already has details
  const { data: existing, error: checkError } = await supabase
    .from('products')
    .select('id, title, details')
    .eq('id', product.id)
    .single()

  if (checkError) {
    console.error('Error checking product:', checkError)
    return false
  }

  // Skip if product already has details
  if (existing.details) {
    console.log(`Product already has details, skipping: ${existing.title}`)
    return true
  }

  console.log('\nAttempting to update database...')
  console.log('Product ID:', product.id)
  console.log('New Details:', details)

  // Try the update
  const { data: updated, error: updateError } = await supabase
    .from('products')
    .update({ 
      details: details,
      last_updated: new Date().toISOString()
    })
    .eq('id', product.id)
    .select()

  if (updateError) {
    console.error('Update error:', updateError)
    return false
  }

  // Verify the update worked
  const { data: verified, error: verifyError } = await supabase
    .from('products')
    .select('id, title, details')
    .eq('id', product.id)
    .single()

  if (verifyError || !verified.details) {
    console.error('Update verification failed')
    return false
  }

  return true
}

async function isValidUrl(url) {
  try {
    const response = await fetch(url, { method: 'HEAD' })
    return response.ok
  } catch (error) {
    return false
  }
}

async function updateProductsWithDetails() {
  try {
    // Get only products without details from HAIR & COSMETICS category
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .eq('category', 'HAIR & COSMETICS')
      .is('details', null)
      .filter('product_url', 'ilike', '%beautyexpressgh.com%')

    if (error) throw error

    console.log(`Found ${products.length} Beauty Express products without details`)

    if (products.length === 0) {
      console.log('No products need updating')
      return
    }

    const browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox']
    })
    
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })

    // Set a longer default timeout
    page.setDefaultTimeout(60000) // 60 seconds

    let successCount = 0
    let failCount = 0

    for (const product of products) {
      try {
        console.log(`\n----------------------------------------`)
        console.log(`Processing ${successCount + failCount + 1}/${products.length}: ${product.title}`)
        console.log(`Attempting URL: ${product.product_url}`)
        
        // Check if URL is valid before trying to navigate
        if (!product.product_url || !(await isValidUrl(product.product_url))) {
          console.log(`Invalid URL for: ${product.title}`)
          failCount++
          continue
        }

        // Add error handler for page timeouts
        try {
          console.log('Navigating to page...')
          await page.goto(product.product_url, { 
            waitUntil: 'domcontentloaded',
            timeout: 45000
          })
          console.log('Page loaded successfully')

          // Take a screenshot to debug
          await page.screenshot({ path: `debug-${product.id}.png` })

        } catch (navigationError) {
          console.error(`Navigation failed for ${product.title}:`, navigationError.message)
          failCount++
          continue
        }

        // Wait for content to be available
        try {
          await page.waitForSelector('.woocommerce-product-details__short-description, #tab-description .panel-body', {
            timeout: 5000
          })
        } catch (selectorError) {
          console.log(`Content not found for: ${product.title}`)
          failCount++
          continue
        }
        
        const details = await scrapeProductDetails(page)
        
        if (!details.details) {
          console.log(`No details found for: ${product.title}`)
          failCount++
          continue
        }

        const updateSuccessful = await updateProductDetails(product, details.details)

        if (updateSuccessful) {
          console.log(`✓ Successfully updated: ${product.title}`)
          successCount++
        } else {
          console.error(`Failed to update: ${product.title}`)
          failCount++
        }

        await delay(2000)

      } catch (error) {
        console.error(`Error processing ${product.title}:`, error.message)
        failCount++
        
        // Try to recover from crashes by restarting the browser
        if (error.message.includes('crashed')) {
          console.log('Browser crashed, restarting...')
          await browser.close()
          browser = await puppeteer.launch({
            headless: "new",
            args: ['--no-sandbox']
          })
          page = await browser.newPage()
          await page.setViewport({ width: 1280, height: 800 })
        }
        continue
      }
    }

    await browser.close()
    console.log('\nUpdate Summary:')
    console.log(`Successfully updated: ${successCount} products`)
    console.log(`Failed to update: ${failCount} products`)

  } catch (error) {
    console.error('Error updating products:', error)
    throw error
  }
}

// Run the updater
updateProductsWithDetails().catch(console.error) 