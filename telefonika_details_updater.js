import { createClient } from '@supabase/supabase-js'
import puppeteer from 'puppeteer'

const supabaseUrl = 'https://rhhcxjijveqtldxjecme.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoaGN4amlqdmVxdGxkeGplY21lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg0MzQxOTIsImV4cCI6MjA1NDAxMDE5Mn0.7pLGIoYPMhFDpcCmFBNJ2lqL0YMoXpv12z0MxsOj-V0'
const supabase = createClient(supabaseUrl, supabaseKey)

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function scrapeProductDetails(page) {
  const details = await page.evaluate(() => {
    console.log('Checking for description...')
    const description = document.querySelector('#tab-description .wc-tab-inner')?.textContent?.trim()
    console.log('Found description:', description ? 'Yes' : 'No')

    console.log('Checking for capacity variations...')
    const variations = []
    const capacitySelect = document.querySelector('select[name="attribute_capacity"]')
    
    if (capacitySelect) {
      console.log('Found capacity select element')
      const options = Array.from(capacitySelect.options).slice(1)
      console.log(`Found ${options.length} capacity options:`, options.map(o => o.value))
      
      variations.push(...options.map(option => ({
        capacity: option.value,
        price: null
      })))
    } else {
      console.log('No capacity variations found')
    }

    console.log('Checking for base price...')
    let basePrice = null
    const priceElement = document.querySelector('.price .woocommerce-Price-amount')
    if (priceElement) {
      basePrice = priceElement.textContent
        .replace('₵', '')
        .replace(/,/g, '')
        .trim()
      console.log('Found base price:', basePrice)
    } else {
      console.log('No base price found')
    }

    return {
      description,
      variations,
      basePrice
    }
  })

  console.log('\nScraped Details:')
  console.log('Description length:', details.description?.length || 0)
  console.log('Number of variations:', details.variations.length)
  console.log('Base price:', details.basePrice)
  
  return details
}

async function getVariationPrice(page, capacity) {
  console.log(`\nGetting price for capacity: ${capacity}`)
  
  try {
    // First click the capacity dropdown to ensure it's active
    await page.click('select[name="attribute_capacity"]')
    await delay(500)

    // Select the capacity option
    await page.select('select[name="attribute_capacity"]', capacity)
    
    // Wait for price element to be updated
    await page.waitForFunction(
      () => {
        const priceEl = document.querySelector('.woocommerce-variation-price .woocommerce-Price-amount')
        return priceEl && priceEl.textContent.includes('₵')
      },
      { timeout: 5000 }
    )

    // Get the updated price
    const price = await page.evaluate(() => {
      const priceEl = document.querySelector('.woocommerce-variation-price .woocommerce-Price-amount')
      if (!priceEl) return null
      
      const price = parseFloat(priceEl.textContent.replace('₵', '').replace(/,/g, ''))
      return price > 0 ? price : null
    })

    if (!price) {
      console.log(`No valid price found for ${capacity}`)
      return null
    }

    console.log(`Got price for ${capacity}: ₵${price}`)
    return price

  } catch (error) {
    console.error(`Error getting price for ${capacity}:`, error.message)
    return null
  }
}

async function checkForDuplicates(title, capacity = null) {
  // If checking a variation, look for exact match
  if (capacity) {
    const { data } = await supabase
      .from('products')
      .select('*')
      .ilike('title', `${title} - ${capacity}`)

    return data && data.length > 0 ? data[0] : null
  }

  // If checking base product, look for similar titles
  const { data } = await supabase
    .from('products')
    .select('*')
    .ilike('title', `%${title}%`)

  return data && data.length > 0 ? data : null
}

async function updateProductInDB(product, details, variations) {
  try {
    // Basic validation
    if (!details.description) {
      console.log('No description found, skipping update')
      return
    }

    if (variations && variations.length > 0) {
      // Filter out variations with invalid prices
      const validVariations = variations.filter(v => {
        return v.price && v.price > 0
      })
      
      if (validVariations.length === 0) {
        console.log('No valid variations found, skipping product')
        return
      }

      // Log variations for debugging
      console.log('\nValid variations:')
      validVariations.forEach(v => {
        console.log(`${v.capacity}: ₵${v.price}`)
      })

      // Check for existing variations and handle appropriately
      for (const variation of validVariations) {
        const variationTitle = `${product.title} - ${variation.capacity}`
        const existing = await checkForDuplicates(product.title, variation.capacity)

        if (existing) {
          console.log(`Variation exists: ${variationTitle}`)
          // Update if data is different
          if (existing.price !== variation.price || existing.details !== details.description) {
            console.log(`Updating existing variation with new data`)
            await supabase
              .from('products')
              .update({
                price: variation.price,
                details: details.description,
                last_updated: new Date().toISOString()
              })
              .eq('id', existing.id)
          }
          continue
        }

        console.log(`Creating new variation: ${variationTitle} (₵${variation.price})`)
        
        const { error } = await supabase
          .from('products')
          .insert({
            title: variationTitle,
            price: variation.price,
            details: details.description,
            product_url: product.product_url,
            category: 'MOBILES & COMPUTERS',
            image_url: product.image_url,
            last_updated: new Date().toISOString()
          })

        if (error) {
          console.error('Insert error:', error)
          continue
        }
      }

      // Check if original product has no variations
      const duplicates = await checkForDuplicates(product.title)
      if (duplicates && duplicates.length > 1) {
        console.log('Removing original product as variations exist')
        await supabase
          .from('products')
          .delete()
          .eq('id', product.id)
      }

    } else {
      // Single product update
      const price = parseFloat(details.basePrice)
      if (!price || price <= 0) {
        console.log('Invalid base price (≤ 0), skipping update')
        return
      }

      // Check for duplicates
      const duplicates = await checkForDuplicates(product.title)
      if (duplicates && duplicates.length > 1) {
        console.log('Found duplicate products, cleaning up...')
        // Keep the one with most recent data
        const sorted = duplicates.sort((a, b) => 
          new Date(b.last_updated) - new Date(a.last_updated)
        )
        
        // Delete all but the most recent
        for (let i = 1; i < sorted.length; i++) {
          await supabase
            .from('products')
            .delete()
            .eq('id', sorted[i].id)
        }
      }

      console.log(`Updating single product with price: ₵${price}`)
      
      const { error } = await supabase
        .from('products')
        .update({
          details: details.description,
          price: price,
          last_updated: new Date().toISOString()
        })
        .eq('id', product.id)

      if (error) {
        console.error('Update error:', error)
      }
    }
  } catch (error) {
    console.error('Database operation error:', error)
  }
}

async function updateTelefonikaMobileProducts() {
  try {
    // Get all Telefonika mobile products
    const { data: products, error } = await supabase
      .from('products')
      .select('*')
      .eq('category', 'MOBILES & COMPUTERS')
      .ilike('product_url', '%telefonika.com%')

    if (error) throw error

    console.log(`Found ${products.length} Telefonika mobile products`)

    const browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox']
    })
    
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })

    for (const product of products) {
      try {
        console.log(`\n----------------------------------------`)
        console.log(`Processing: ${product.title}`)
        console.log(`URL: ${product.product_url}`)

        await page.goto(product.product_url, { 
          waitUntil: 'networkidle0',
          timeout: 60000 
        })

        const details = await scrapeProductDetails(page)
        console.log('Details:', details)

        if (details.variations.length > 0) {
          // Get price for each variation
          for (const variation of details.variations) {
            const price = await getVariationPrice(page, variation.capacity)
            variation.price = price
            console.log(`Variation: ${variation.capacity} - ₵${price}`)
          }
        }

        await updateProductInDB(product, details, details.variations)
        console.log(`✓ Updated: ${product.title}`)
        
        await delay(2000)

      } catch (error) {
        console.error(`Error processing ${product.title}:`, error.message)
        continue
      }
    }

    await browser.close()
    console.log('\nCompleted updating Telefonika mobile products')

  } catch (error) {
    console.error('Error:', error)
  }
}

// Run the updater
updateTelefonikaMobileProducts().catch(console.error) 