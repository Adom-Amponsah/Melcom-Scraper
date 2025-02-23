import puppeteer from 'puppeteer'
import fs from 'fs/promises'
import path from 'path'

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function scrapeProductDetails(page) {
  return await page.evaluate(() => {
    // Get the product details from the description tab
    const details = document.querySelector('#tab-description .panel-body')?.textContent?.trim()
    const brand = document.querySelector('.pwb-single-product-brands a')?.getAttribute('title')
    const rating = document.querySelector('.star-rating')?.getAttribute('aria-label')?.split(' ')[1] || '0'
    
    return {
      details,
      brand,
      rating: parseFloat(rating)
    }
  })
}

async function scrapeAllProductDetails() {
  try {
    const browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox']
    })
    
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })
    
    // Read the existing products data
    const productsData = JSON.parse(
      await fs.readFile('./beautyexpress_files/all_products.json', 'utf-8')
    )
    
    const enhancedProducts = []
    
    for (const product of productsData.products) {
      if (!product.url) continue
      
      console.log(`Scraping details for: ${product.title}`)
      await page.goto(product.url, { waitUntil: 'networkidle0' })
      
      const details = await scrapeProductDetails(page)
      
      enhancedProducts.push({
        ...product,
        details: details.details,
        brand: details.brand,
        rating: details.rating
      })
      
      await delay(2000) // Be nice to the server
    }
    
    // Save enhanced products data
    await fs.writeFile(
      './beautyexpress_files/products_with_details.json',
      JSON.stringify({
        ...productsData,
        products: enhancedProducts
      }, null, 2)
    )
    
    console.log(`Completed: Enhanced ${enhancedProducts.length} products with details`)
    
    await browser.close()
    return enhancedProducts
    
  } catch (error) {
    console.error(`Error scraping product details:`, error)
    throw error
  }
}

// Run the scraper
scrapeAllProductDetails().catch(console.error) 