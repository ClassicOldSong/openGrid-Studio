import { createDOMRenderer } from 'refui/dom'
import { defaults } from 'refui/browser'
import App from './App.jsx'

const renderer = createDOMRenderer(defaults)
const root = document.getElementById('app')
renderer.render(root, App)
