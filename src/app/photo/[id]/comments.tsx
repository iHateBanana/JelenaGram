import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { Loading, Message } from '@/components/states';
import { addComment, deleteComment, fetchComments } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { colors, MAX_CONTENT_WIDTH } from '@/lib/theme';

export default function Comments() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { me, nameOf } = useAuth();
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const insets = useSafeAreaInsets();

  const comments = useQuery({ queryKey: ['comments', id], queryFn: () => fetchComments(id), enabled: !!id });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['comments', id] });
    qc.invalidateQueries({ queryKey: ['albumComments'] });
    qc.invalidateQueries({ queryKey: ['feed'] });
    qc.invalidateQueries({ queryKey: ['albumPhotos'] });
  };

  const send = useMutation({
    mutationFn: () => addComment(id, text),
    onSuccess: () => {
      setText('');
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
          data={comments.data}
          keyExtractor={(c) => c.id}
          contentContainerStyle={{ padding: 16, gap: 14, flexGrow: 1 }}
          ListEmptyComponent={<Message title="No comments yet" body="Be the first to say something." />}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.body}>
                <Text style={styles.author}>{nameOf(item.user_id)} </Text>
                {item.body}
              </Text>
              {item.user_id === me && (
                <Pressable onPress={() => remove.mutate(item.id)} hitSlop={8}>
                  <Text style={styles.delete}>Delete</Text>
                </Pressable>
              )}
            </View>
          )}
        />
        {send.isError && <Text style={styles.error}>{send.error.message}</Text>}
        <View style={[styles.inputBar, { paddingBottom: Math.max(12, insets.bottom + 4) }]}>
          <TextInput
            style={styles.input}
            placeholder="Add a comment…"
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

const styles = StyleSheet.create({
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  body: { flex: 1, fontSize: 15, color: colors.text },
  author: { fontWeight: '700' },
  delete: { color: colors.muted, fontSize: 13 },
  error: { color: colors.like, paddingHorizontal: 16 },
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
  },
  post: { color: colors.link, fontWeight: '700', fontSize: 16 },
  postBtn: { paddingVertical: 8, paddingHorizontal: 4 },
});
