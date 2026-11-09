<script setup lang="ts">
import { computed } from 'vue'
import { useData, withBase } from 'vitepress'
import { sections } from '../sections'
import { data as posts } from './posts.data'

const { page } = useData()
const post = computed(() => posts.find(item => item.url === '/' + page.value.relativePath.replace(/\.md$/, '')))
const updated = computed(() => page.value.lastUpdated
  ? new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(page.value.lastUpdated)
  : post.value?.date)
</script>

<template>
  <div v-if="post" class="post-meta">
    <time :datetime="post.date">发布于 {{ post.date }}</time>
    <time :datetime="updated">更新于 {{ updated }}</time>
    <span>约 {{ post.minutes }} 分钟</span>
    <a class="post-tag" :href="withBase(sections[post.section].link)">{{ sections[post.section].label }}</a>
  </div>
</template>
