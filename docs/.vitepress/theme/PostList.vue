<script setup lang="ts">
import { computed } from 'vue'
import { withBase } from 'vitepress'
import { sections, type Section } from '../sections'
import { data as posts } from './posts.data'

const props = defineProps<{ section?: Section; limit?: number; cards?: boolean }>()
const entries = computed(() => {
  const matching = posts.filter(post => !props.section || post.section === props.section)
  return props.limit ? matching.slice(0, props.limit) : matching
})
</script>

<template>
  <ul v-if="cards && entries.length" class="post-cards">
    <li v-for="post in entries" :key="post.url" class="post-card">
      <a class="post-card-link" :href="withBase(post.url)">
        <time class="post-card-date" :datetime="post.date">{{ post.date }}</time>
        <img v-if="post.cover" class="post-card-cover" :src="withBase(post.cover)" alt="" loading="lazy">
        <div class="post-card-body">
          <span class="post-title">{{ post.title }}</span>
          <p v-if="post.description" class="post-summary">{{ post.description }}</p>
          <span class="post-tag">{{ sections[post.section].label }}</span>
        </div>
      </a>
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
