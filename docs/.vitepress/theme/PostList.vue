<script setup lang="ts">
import { computed } from 'vue'
import { withBase } from 'vitepress'
import { sections, type Section } from '../sections'
import { data as posts } from './posts.data'

const props = defineProps<{ section?: Section; limit?: number }>()
const entries = computed(() => {
  const matching = posts.filter(post =>
    !post.url.endsWith('/__editor-preview') && (!props.section || post.section === props.section)
  )
  return props.limit ? matching.slice(0, props.limit) : matching
})
</script>

<template>
  <ul v-if="!section && entries.length" class="post-links" aria-label="文章列表">
    <li v-for="post in entries" :key="post.url">
      <time :datetime="post.date">{{ post.date }}</time>
      <a :href="withBase(post.url)">{{ post.title }}</a>
    </li>
  </ul>
  <ul v-else-if="entries.length" class="post-list">
    <li v-for="post in entries" :key="post.url" class="post-row">
      <div>
        <a class="post-title" :href="withBase(post.url)">{{ post.title }}</a>
        <p v-if="post.description" class="post-summary">{{ post.description }}</p>
      </div>
      <div class="post-row-meta">
        <span class="post-tag">{{ sections[post.section].label }}</span>
        <time :datetime="post.date">{{ post.date }}</time>
      </div>
    </li>
  </ul>
  <p v-else class="post-empty">暂无已发布文章。</p>
</template>
