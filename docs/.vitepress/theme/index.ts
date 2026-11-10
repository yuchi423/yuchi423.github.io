import DefaultTheme from 'vitepress/theme'
import type { Theme } from 'vitepress'
import Layout from './Layout.vue'
import ArticleMeta from './ArticleMeta.vue'
import PostList from './PostList.vue'
import './style.css'
import './figure.css'

export default {
  extends: DefaultTheme,
  Layout,
  enhanceApp({ app }) {
    app.component('ArticleMeta', ArticleMeta)
    app.component('PostList', PostList)
  }
} satisfies Theme
