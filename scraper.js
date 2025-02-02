import puppeteer from 'puppeteer'
import fs from 'fs/promises'
import { MELCOM_CATEGORIES } from './categories.js'

async function scrapePageProducts(page) {
  return await page.evaluate(() => {
    const items = []
    document.querySelectorAll('.product-item').forEach(element => {
      const title = element.querySelector('.product-item-link')?.textContent?.trim()
      const price = element.querySelector('.price')?.textContent?.trim()
      const image = element.querySelector('.product-image-photo')?.getAttribute('src')
      const url = element.querySelector('.product-item-link')?.getAttribute('href')
      
      if (title && price) {
        items.push({ title, price, image, url })
      }
    })
    return items
  })
}

async function getCurrentPageNumber(page) {
  return await page.evaluate(() => {
    const currentPage = document.querySelector('.pages .current')?.textContent?.trim()
    return currentPage ? parseInt(currentPage) : null
  })
}

async function scrapeMelcom(category) {
  try {
    const browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox']
    })
    
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })
    
    let currentPage = 1
    let allProducts = []
    let hasNextPage = true
    let lastPageProducts = new Set() // To detect duplicate products
    
    // Create directory for category
    const categoryDir = `./html_files/${category.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}`
    await fs.mkdir(categoryDir, { recursive: true })
    
    while (hasNextPage) {
      const url = `https://melcom.com/categories.html?cat=${category.id}&p=${currentPage}`
      console.log(`Navigating to ${category.name} - Page ${currentPage} (${url})`)
      
      await page.goto(url, { waitUntil: 'networkidle0' })
      
      try {
        await page.waitForSelector('.product-item', { timeout: 10000 })
        
        // Check actual page number from pagination
        const actualPage = await getCurrentPageNumber(page)
        if (actualPage && actualPage < currentPage) {
          console.log(`Detected redirect to page ${actualPage}. We've reached the end.`)
          hasNextPage = false
          break
        }

        const pageProducts = await scrapePageProducts(page)
        
        // Check for duplicate products from last page
        const currentPageProductsStr = JSON.stringify(pageProducts)
        if (lastPageProducts.has(currentPageProductsStr)) {
          console.log(`Detected duplicate products. We've reached the end at page ${currentPage - 1}`)
          hasNextPage = false
          break
        }
        
        if (pageProducts.length === 0) {
          hasNextPage = false
          console.log(`No products found on page ${currentPage}`)
        } else {
          // Save page products
          await fs.writeFile(
            `${categoryDir}/products_page_${currentPage}.json`,
            JSON.stringify({
              category: category.name,
              page: currentPage,
              productsCount: pageProducts.length,
              scrapedAt: new Date().toISOString(),
              products: pageProducts
            }, null, 2)
          )
          
          allProducts = [...allProducts, ...pageProducts]
          console.log(`Found ${pageProducts.length} products on page ${currentPage}`)
          
          // Store current page products for next iteration comparison
          lastPageProducts.clear()
          lastPageProducts.add(currentPageProductsStr)
          
          currentPage++
        }
      } catch (error) {
        hasNextPage = false
        console.log(`Finished at page ${currentPage - 1} (${error.message})`)
      }
    }
    
    // Save all products combined
    await fs.writeFile(
      `${categoryDir}/all_products.json`,
      JSON.stringify({
        category: category.name,
        expectedCount: category.count,
        actualCount: allProducts.length,
        totalPages: currentPage - 1,
        scrapedAt: new Date().toISOString(),
        products: allProducts
      }, null, 2)
    )
    
    console.log(`Completed ${category.name}: Found ${allProducts.length}/${category.count} products across ${currentPage - 1} pages`)
    
    await browser.close()
    return allProducts
    
  } catch (error) {
    console.error(`Error scraping ${category.name}:`, error)
    throw error
  }
}

// Run the scraper for all categories
async function scrapeAllCategories() {
  for (const category of MELCOM_CATEGORIES) {
    console.log(`Starting to scrape ${category.name}...`)
    try {
      await scrapeMelcom(category)
      // Add a delay between categories to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 3000))
    } catch (error) {
      console.error(`Failed to scrape ${category.name}`)
    }
  }
}

scrapeAllCategories().catch(console.error)