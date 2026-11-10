<script setup lang="ts">
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import { articleSection, sections } from '../sections'
import { data as posts } from './posts.data'
import PostList from './PostList.vue'

const { Layout } = DefaultTheme
const { page } = useData()
const section = computed(() => articleSection(page.value.relativePath))
const currentUrl = computed(() => '/' + page.value.relativePath.replace(/\.md$/, ''))
const sectionPosts = computed(() => posts.filter(post => post.section === section.value))
const currentIndex = computed(() => sectionPosts.value.findIndex(post => post.url === currentUrl.value))
const neighbors = computed(() => [
  { label: '上一篇', post: sectionPosts.value[currentIndex.value + 1], direction: 'previous' },
  { label: '下一篇', post: sectionPosts.value[currentIndex.value - 1], direction: 'next' }
].filter(item => item.post))
</script>

<template>
  <Layout>
    <template #home-features-after>
      <section class="home-posts" aria-labelledby="recent-title">
        <h2 id="recent-title">最新文章</h2>
        <PostList :limit="6" cards />
      </section>
    </template>
    <template #sidebar-nav-after>
      <ul v-if="sectionPosts.length" class="post-sidebar">
        <li v-for="post in sectionPosts" :key="post.url">
          <a :href="withBase(post.url)" :aria-current="post.url === currentUrl ? 'page' : undefined">
            {{ post.title }}
          </a>
        </li>
      </ul>
    </template>
    <template #doc-before>
      <nav v-if="section" class="post-breadcrumb" aria-label="当前位置">
        <a :href="withBase('/')">首页</a><span aria-hidden="true">/</span>
        <a :href="withBase(sections[section].link)">{{ sections[section].label }}</a>
      </nav>
    </template>
    <template #doc-after>
      <nav v-if="currentIndex >= 0 && neighbors.length" class="post-pager" aria-label="相邻文章">
        <a v-for="item in neighbors" :key="item.direction" :class="item.direction" :href="withBase(item.post.url)">
          <span>{{ item.label }}</span>
          <strong>{{ item.post.title }}</strong>
        </a>
      </nav>
    </template>
  </Layout>
</template>
