import DashboardClient from '@/components/dashboard/dashboard-client'

export default async function DashboardPage() {
  // Note: Authentication is handled on the client side with localStorage
  // The DashboardClient component will check for the user session and redirect if needed
  
  return <DashboardClient />
}
