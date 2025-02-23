import puppeteer from 'puppeteer'
import fs from 'fs/promises'
import { TELEFONIKA_ENTERTAINMENT_CATEGORIES } from './telefonika_entertainment_categories.js'

// Reuse the same scraping functions
async function autoScroll(page) {
  await page.evaluate(async () => {
    await new Promise((resolve) => {
      let totalHeight = 0
      const distance = 100
      const timer = setInterval(() => {
        const scrollHeight = document.documentElement.scrollHeight
        window.scrollBy(0, distance)
        totalHeight += distance

        if(totalHeight >= scrollHeight) {
          clearInterval(timer)
          resolve()
        }
      }, 100)
    })
  })
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function scrapePageProducts(page) {
  return await page.evaluate(() => {
    const items = []
    document.querySelectorAll('.product-grid-item').forEach(element => {
      const title = element.querySelector('.wd-entities-title a')?.textContent?.trim()
      const price = element.querySelector('.price .amount')?.textContent?.trim()
      const image = element.querySelector('.product-image-link img')?.getAttribute('src')
      const url = element.querySelector('.wd-entities-title a')?.getAttribute('href')
      const description = element.querySelector('.hover-content-inner')?.textContent?.trim()
      
      if (title && price) {
        items.push({ 
          title, 
          price, 
          image, 
          url,
          description 
        })
      }
    })
    return items
  })
}

async function scrapeTelefonika(category) {
  try {
    const browser = await puppeteer.launch({
      headless: "new",
      args: ['--no-sandbox']
    })
    
    const page = await browser.newPage()
    await page.setViewport({ width: 1280, height: 800 })
    
    // Navigate to category page
    console.log(`Navigating to ${category.name} (${category.url})`)
    await page.goto(category.url, { waitUntil: 'networkidle0' })
    
    let previousHeight = 0
    let currentHeight = 1
    let attempts = 0
    const maxAttempts = 50 // Safety limit
    
    // Create directory for entertainment category
    const categoryDir = `./telefonika_files/entertainment/${category.id}`
    await fs.mkdir(categoryDir, { recursive: true })
    
    // Keep scrolling until no new content is loaded
    while (previousHeight !== currentHeight && attempts < maxAttempts) {
      previousHeight = await page.evaluate(() => document.documentElement.scrollHeight)
      
      // Scroll and wait for new content
      await autoScroll(page)
      await delay(2000) // Wait for new content to load
      
      currentHeight = await page.evaluate(() => document.documentElement.scrollHeight)
      
      if (previousHeight === currentHeight) {
        // Double check by waiting and trying one more time
        await delay(2000)
        await autoScroll(page)
        currentHeight = await page.evaluate(() => document.documentElement.scrollHeight)
      }
      
      attempts++
      console.log(`Scroll attempt ${attempts}: Height ${currentHeight}`)
    }
    
    // Extract all products after scrolling
    const products = await scrapePageProducts(page)
    console.log(`Found ${products.length} products in ${category.name}`)
    
    // Save all products
    await fs.writeFile(
      `${categoryDir}/all_products.json`,
      JSON.stringify({
        category: category.name,
        totalProducts: products.length,
        scrapedAt: new Date().toISOString(),
        products: products
      }, null, 2)
    )
    
    await browser.close()
    return products
    
  } catch (error) {
    console.error(`Error scraping ${category.name}:`, error)
    throw error
  }
}

// Run the scraper for all entertainment categories
async function scrapeAllCategories() {
  for (const category of TELEFONIKA_ENTERTAINMENT_CATEGORIES) {
    console.log(`Starting to scrape ${category.name}...`)
    try {
      await scrapeTelefonika(category)
      // Add a delay between categories
      await delay(3000)
    } catch (error) {
      console.error(`Failed to scrape ${category.name}`)
    }
  }
}

scrapeAllCategories().catch(console.error) 