<script setup lang="ts">
/** @fileoverview Advanced task options panel (UA, auth, referer, cookie, proxy). */
import { useI18n } from 'vue-i18n'
import { NFormItem, NInput, NCheckbox, NCollapseTransition } from 'naive-ui'

const { t } = useI18n()

defineProps<{
  show: boolean
  userAgent: string
  authorization: string
  referer: string
  cookie: string
  allProxy: string
}>()

defineEmits<{
  'update:show': [value: boolean]
  'update:userAgent': [value: string]
  'update:authorization': [value: string]
  'update:referer': [value: string]
  'update:cookie': [value: string]
  'update:allProxy': [value: string]
}>()
</script>

<template>
  <NFormItem :show-label="false">
    <NCheckbox :checked="show" @update:checked="$emit('update:show', $event)">
      {{ t('task.show-advanced-options') }}
    </NCheckbox>
  </NFormItem>
  <NCollapseTransition :show="show">
    <div>
      <NFormItem :label="t('task.task-user-agent') + ':'">
        <NInput
          :value="userAgent"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 3 }"
          @update:value="$emit('update:userAgent', $event)"
        />
      </NFormItem>
      <NFormItem :label="t('task.task-authorization') + ':'">
        <NInput
          :value="authorization"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 3 }"
          @update:value="$emit('update:authorization', $event)"
        />
      </NFormItem>
      <NFormItem :label="t('task.task-referer') + ':'">
        <NInput
          :value="referer"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 3 }"
          @update:value="$emit('update:referer', $event)"
        />
      </NFormItem>
      <NFormItem :label="t('task.task-cookie') + ':'">
        <NInput
          :value="cookie"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 3 }"
          @update:value="$emit('update:cookie', $event)"
        />
      </NFormItem>
      <NFormItem :label="t('task.task-proxy') + ':'">
        <NInput
          :value="allProxy"
          type="textarea"
          :autosize="{ minRows: 2, maxRows: 3 }"
          placeholder="[http://][USER:PASSWORD@]HOST[:PORT]"
          @update:value="$emit('update:allProxy', $event)"
        />
      </NFormItem>
    </div>
  </NCollapseTransition>
</template>
