import type { AppProps } from 'next/app'
import Link from 'next/link'
import { useRouter } from 'next/router'
import '@/styles/globals.css'

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter()
  const path = router.pathname

  return (
    <>
      <nav>
        <span className="nav-brand">Pattern Atlas</span>
        <Link href="/agent" className={path === '/agent' ? 'active' : ''}>Agent</Link>
        <Link href="/discover" className={path === '/discover' ? 'active' : ''}>Discover</Link>
        <Link href="/casestudy" className={path === '/casestudy' ? 'active' : ''}>Case Study</Link>
        <Link href="/journal" className={path.startsWith('/journal') ? 'active' : ''}>Journal</Link>
      </nav>
      <Component {...pageProps} />
    </>
  )
}
