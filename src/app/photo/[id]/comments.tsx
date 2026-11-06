import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/components/text';

import { useViewer } from '@/components/photo-viewer';
import { Loading, Message } from '@/components/states';
import { addComment, deleteComment, fetchComments, fetchPhoto } from '@/lib/api';
import type { Comment } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { confirm } from '@/lib/confirm';
import { monthYear, timeAgo } from '@/lib/dates';
import { findCachedPhoto, patchPhoto } from '@/lib/photo-cache';
import { colors, MAX_CONTENT_WIDTH, themed, useTheme } from '@/lib/theme';

export default function Comments() {
  useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, nameOf } = useAuth();
  const qc = useQueryClient();
  const viewer = useViewer();
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const insets = useSafeAreaInsets();

  const comments = useQuery({ queryKey: ['comments', id], queryFn: () => fetchComments(id), enabled: !!id });
  const photo = useQuery({
    queryKey: ['photo', id, me],
    queryFn: () => fetchPhoto(id, me!),
    enabled: !!id && !!me,
    initialData: () => findCachedPhoto(qc, id),
  });

  // Keeps "View N comments" right without refetching the whole feed after each comment.
  const commentCount = comments.data?.length;
  useEffect(() => {
    if (commentCount === undefined) return;
    patchPhoto(qc, id, (p) => (p.commentCount === commentCount ? p : { ...p, commentCount }));
  }, [commentCount, id, qc]);

  const threaded = useMemo(() => {
    const all = comments.data ?? [];
    const byId = new Map(all.map((c) => [c.id, c]));
    const rootOf = (c: Comment): string => {
      let cur = c;
      while (cur.parent_id && byId.has(cur.parent_id)) cur = byId.get(cur.parent_id)!;
      return cur.id;
    };
    const roots = all.filter((c) => !c.parent_id || !byId.has(c.parent_id));
    const out: { c: Comment; reply: boolean }[] = [];
    for (const r of roots) {
      out.push({ c: r, reply: false });
      for (const c of all) if (c.parent_id && c.id !== r.id && rootOf(c) === r.id) out.push({ c, reply: true });
    }
    return out;
  }, [comments.data]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['comments', id] });
    qc.invalidateQueries({ queryKey: ['albumComments'] });
  };

  const send = useMutation({
    mutationFn: () => addComment(id, text, replyTo?.id ?? null),
    onSuccess: () => {
      setText('');
      setReplyTo(null);
      refresh();
    },
  });
  const remove = useMutation({
    mutationFn: async (comment: Comment) => {
      const hasReplies = (comments.data ?? []).some((c) => c.parent_id === comment.id);
      const ok = await confirm(
        'Delete this comment?',
        hasReplies ? 'Its replies will be deleted too.' : 'This cannot be undone.',
        'Delete',
      );
      if (ok) await deleteComment(comment.id);
    },
    onSuccess: refresh,
  });

  if (comments.isPending) return <Loading />;
  if (comments.isError) {
    return <Message title="Couldn't load comments" body={comments.error.message} action="Retry" onAction={() => comments.refetch()} />;
  }

  const canSend = text.trim().length > 0 && !send.isPending;
  const p = photo.data;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, alignItems: 'center' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={90}>
      <View style={{ flex: 1, width: '100%', maxWidth: MAX_CONTENT_WIDTH }}>
        <FlatList
          data={threaded}
          keyExtractor={(x) => x.c.id}
          contentContainerStyle={{ padding: 16, gap: 14, flexGrow: 1 }}
          ListHeaderComponent={
            p ? (
              <Pressable
                style={styles.photoRow}
                onPress={() => viewer.open([p], 0)}
                accessibilityRole="button"
                accessibilityLabel="Open photo">
                <Image
                  source={{ uri: p.thumbUrl ?? p.url, cacheKey: p.thumbKey }}
                  cachePolicy="memory-disk"
                  style={styles.photoThumb}
                  contentFit="cover"
                />
                <View style={{ flex: 1 }}>
                  <Text style={styles.photoAlbum} numberOfLines={1}>{p.album.name}</Text>
                  <Text style={styles.time}>{monthYear(p.taken_at)}</Text>
                </View>
              </Pressable>
            ) : undefined
          }
          ListEmptyComponent={<Message title="No comments yet" body="Be the first to say something." />}
          renderItem={({ item: { c: item, reply } }) => (
            <View style={[styles.row, reply && styles.reply]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.body}>
                  <Text style={styles.author}>{nameOf(item.user_id)} </Text>
                  {item.body}
                </Text>
                <View style={styles.meta}>
                  <Text style={styles.time}>{timeAgo(item.created_at)}</Text>
                  <Pressable onPress={() => setReplyTo(item)} style={styles.metaBtn} accessibilityRole="button">
                    <Text style={styles.action}>Reply</Text>
                  </Pressable>
                  {item.user_id === me && (
                    <Pressable onPress={() => remove.mutate(item)} style={styles.metaBtn} accessibilityRole="button">
                      <Text style={styles.action}>Delete</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            </View>
          )}
        />
        {(send.isError || remove.isError) && <Text style={styles.error}>{(send.error ?? remove.error)?.message}</Text>}
        {replyTo && (
          <View style={styles.replyBar}>
            <Text style={styles.action} numberOfLines={1}>
              Replying to {nameOf(replyTo.user_id)}
            </Text>
            <Pressable onPress={() => setReplyTo(null)} accessibilityRole="button">
              <Text style={styles.action}>Cancel</Text>
            </Pressable>
          </View>
        )}
        <View style={[styles.inputBar, { paddingBottom: Math.max(12, insets.bottom + 4) }]}>
          <TextInput
            style={styles.input}
            placeholder={replyTo ? 'Write a reply…' : 'Add a comment…'}
            placeholderTextColor={colors.muted}
            value={text}
            onChangeText={setText}
            multiline
            numberOfLines={1}
            maxLength={2000}
          />
          <Pressable disabled={!canSend} onPress={() => send.mutate()} style={styles.postBtn} accessibilityRole="button">
            <Text style={[styles.post, !canSend && { opacity: 0.4 }]}>Post</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = themed(() => StyleSheet.create({
  photoRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingBottom: 14, marginBottom: 2, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  photoThumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: colors.placeholder },
  photoAlbum: { fontSize: 15, fontWeight: '600', color: colors.text },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  body: { flex: 1, fontSize: 15, lineHeight: 21, color: colors.text },
  author: { fontSize: 15, fontWeight: '700' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  metaBtn: { minHeight: 32, paddingHorizontal: 8, justifyContent: 'center' },
  time: { color: colors.muted, fontSize: 13 },
  action: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  reply: { marginLeft: 28 },
  replyBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.likeTint },
  error: { color: colors.link, fontSize: 14, paddingHorizontal: 16 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  input: {
    flex: 1,
    maxHeight: 100,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    fontSize: 15,
    color: colors.text,
  },
  post: { color: colors.link, fontWeight: '700', fontSize: 16 },
  postBtn: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
}));
