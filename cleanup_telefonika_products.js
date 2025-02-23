import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://rhhcxjijveqtldxjecme.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJoaGN4amlqdmVxdGxkeGplY21lIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Mzg0MzQxOTIsImV4cCI6MjA1NDAxMDE5Mn0.7pLGIoYPMhFDpcCmFBNJ2lqL0YMoXpv12z0MxsOj-V0'
const supabase = createClient(supabaseUrl, supabaseKey)

async function cleanupTelefonikaMobileProducts() {
  try {
    // First get all products with null prices
    const { data: nullPriceProducts, error: selectError } = await supabase
      .from('products')
      .select('*')
      .eq('category', 'MOBILES & COMPUTERS')
      .ilike('product_url', '%telefonika.com%')
      .is('price', null)

    if (selectError) {
      console.error('Error getting null price products:', selectError)
      return
    }

    console.log('\nProducts with null prices to be deleted:')
    nullPriceProducts?.forEach(p => console.log(`- ${p.title}`))

    // Delete products with null prices
    const { error: deleteError } = await supabase
      .from('products')
      .delete()
      .eq('category', 'MOBILES & COMPUTERS')
      .ilike('product_url', '%telefonika.com%')
      .is('price', null)

    if (deleteError) {
      console.error('Error deleting null price products:', deleteError)
      return
    }

    console.log('\nDeleted all null price products')

    // Get remaining products to verify
    const { data: remainingProducts, error } = await supabase
      .from('products')
      .select('*')
      .eq('category', 'MOBILES & COMPUTERS')
      .ilike('product_url', '%telefonika.com%')
      .order('title')

    if (error) {
      console.error('Error getting remaining products:', error)
      return
    }

    console.log('\nRemaining Telefonika products:')
    remainingProducts?.forEach(p => {
      console.log(`${p.title}: ₵${p.price}`)
    })

  } catch (error) {
    console.error('Error:', error)
  }
}

// Run the cleanup
cleanupTelefonikaMobileProducts() 