import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text, TextInput } from '@/components/text';

import { Loading, Message } from '@/components/states';
import { addComment, deleteComment, fetchComments } from '@/lib/api';
import type { Comment } from '@/lib/types';
import { useAuth } from '@/lib/auth';
import { colors, MAX_CONTENT_WIDTH, themed, useTheme } from '@/lib/theme';

export default function Comments() {
  useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, nameOf } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [replyTo, setReplyTo] = useState<Comment | null>(null);
  const insets = useSafeAreaInsets();

  const comments = useQuery({ queryKey: ['comments', id], queryFn: () => fetchComments(id), enabled: !!id });

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
    qc.invalidateQueries({ queryKey: ['feed'] });
    qc.invalidateQueries({ queryKey: ['albumPhotos'] });
  };

  const send = useMutation({
    mutationFn: () => addComment(id, text, replyTo?.id ?? null),
    onSuccess: () => {
      setText('');
      setReplyTo(null);
      refresh();
    },
  });
  const remove = useMutation({ mutationFn: (commentId: string) => deleteComment(commentId), onSuccess: refresh });

  if (comments.isPending) return <Loading />;
  if (comments.isError) {
    return <Message title="Couldn't load comments" body={comments.error.message} action="Retry" onAction={() => comments.refetch()} />;
  }

  const canSend = text.trim().length > 0 && !send.isPending;

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
          ListEmptyComponent={<Message title="No comments yet" body="Be the first to say something." />}
          renderItem={({ item: { c: item, reply } }) => (
            <View style={[styles.row, reply && styles.reply]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.body}>
                  <Text style={styles.author}>{nameOf(item.user_id)} </Text>
                  {item.body}
                </Text>
                <Pressable onPress={() => setReplyTo(item)} hitSlop={8}>
                  <Text style={styles.delete}>Reply</Text>
                </Pressable>
              </View>
              {item.user_id === me && (
                <Pressable onPress={() => remove.mutate(item.id)} hitSlop={8}>
                  <Text style={styles.delete}>Delete</Text>
                </Pressable>
              )}
            </View>
          )}
        />
        {send.isError && <Text style={styles.error}>{send.error.message}</Text>}
        {replyTo && (
          <View style={styles.replyBar}>
            <Text style={styles.delete} numberOfLines={1}>
              Replying to {nameOf(replyTo.user_id)}
            </Text>
            <Pressable onPress={() => setReplyTo(null)} hitSlop={8}>
              <Text style={styles.delete}>Cancel</Text>
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
            maxLength={2000}
          />
          <Pressable disabled={!canSend} onPress={() => send.mutate()} hitSlop={8} style={styles.postBtn}>
            <Text style={[styles.post, !canSend && { opacity: 0.4 }]}>Post</Text>
          </Pressable>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = themed(() => StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  body: { flex: 1, fontSize: 15, color: colors.text },
  author: { fontWeight: '700' },
  delete: { color: colors.muted, fontSize: 13, marginTop: 2 },
  reply: { marginLeft: 28 },
  replyBar: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 6, backgroundColor: colors.likeTint },
  error: { color: colors.link, paddingHorizontal: 16 },
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
  postBtn: { paddingVertical: 8, paddingHorizontal: 4 },
}));
