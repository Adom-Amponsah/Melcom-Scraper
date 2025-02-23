import puppeteer from 'puppeteer'
import fs from 'fs/promises'

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function scrapePageProducts(page) {
  return await page.evaluate(() => {
    const items = []
    document.querySelectorAll('.grid__item').forEach(element => {
      const title = element.querySelector('.card__heading a')?.textContent?.trim()
      const price = element.querySelector('.price-item--regular')?.textContent?.trim()
      const image = element.querySelector('.card__media img')?.getAttribute('srcset')?.split(',')[0]?.split(' ')[0]
      const url = 'https://prettyhairstores.com' + element.querySelector('.card__heading a')?.getAttribute('href')
      
      if (title && price) {
        items.push({ 
          title, 
          price, 
          image, 
          url
        })
      }
    })
    return items
  })
}

async function getLastPageNumber(page) {
  return await page.evaluate(() => {
    const paginationLinks = Array.from(document.querySelectorAll('.pagination__list li'))
    if (paginationLinks.length > 0) {
      const lastLink = paginationLinks[paginationLinks.length - 2] // Last item is usually "Next"
      return parseInt(lastLink.textContent.trim())
    }
    return 1
  })
}

async function scrapePrettyHair() {
  try {
    const browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox']
    })
    
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })
    
    // Create directory for category
    const categoryDir = `./prettyhair_files`
    await fs.mkdir(categoryDir, { recursive: true })
    
    let currentPage = 1
    let allProducts = []
    let hasNextPage = true
    let processedUrls = new Set()
    
    // First visit to get last page number
    await page.goto(`https://prettyhairstores.com/collections/all?page=1`, { waitUntil: 'networkidle0' })
    const lastPage = await getLastPageNumber(page)
    console.log(`Total pages to scrape: ${lastPage}`)
    
    while (currentPage <= lastPage) {
      const url = `https://prettyhairstores.com/collections/all?page=${currentPage}`
      
      if (processedUrls.has(url)) {
        console.log(`Already processed page ${currentPage}, skipping...`)
        currentPage++
        continue
      }
      
      console.log(`Scraping page ${currentPage} of ${lastPage}`)
      await page.goto(url, { waitUntil: 'networkidle0' })
      
      const pageProducts = await scrapePageProducts(page)
      
      if (pageProducts.length === 0) {
        console.log(`No products found on page ${currentPage}, might be the end`)
        break
      }
      
      // Save individual page results
      await fs.writeFile(
        `${categoryDir}/products_page_${currentPage}.json`,
        JSON.stringify({
          page: currentPage,
          productsCount: pageProducts.length,
          scrapedAt: new Date().toISOString(),
          products: pageProducts
        }, null, 2)
      )
      
      allProducts = [...allProducts, ...pageProducts]
      processedUrls.add(url)
      console.log(`Found ${pageProducts.length} products on page ${currentPage}`)
      
      currentPage++
      await delay(2000) // Be nice to the server
    }
    
    // Save all products combined
    await fs.writeFile(
      `${categoryDir}/all_products.json`,
      JSON.stringify({
        category: 'HAIR & COSMETICS',
        totalProducts: allProducts.length,
        totalPages: currentPage - 1,
        scrapedAt: new Date().toISOString(),
        products: allProducts
      }, null, 2)
    )
    
    console.log(`Completed: Found ${allProducts.length} products across ${currentPage - 1} pages`)
    
    await browser.close()
    return allProducts
    
  } catch (error) {
    console.error(`Error scraping Pretty Hair:`, error)
    throw error
  }
}

// Run the scraper
scrapePrettyHair().catch(console.error) 