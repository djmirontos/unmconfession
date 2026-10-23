import { Ionicons } from '@expo/vector-icons';
import { Pressable, Text, View } from 'react-native';

import { SubmitFooter } from '@/components/create/SubmitFooter';
import { ChipGroup } from '@/components/ui/ChipGroup';
import { TextField } from '@/components/ui/TextField';
import { useCreateSubmit } from '@/hooks/useCreateSubmit';
import { useDraft } from '@/hooks/useDraft';
import { useTheme } from '@/hooks/useTheme';
import { useTouched } from '@/hooks/useTouched';
import { createPost } from '@/lib/create';
import { DEFAULT_POLL_HOURS, LIMITS, POLL_DURATIONS, pollSchema } from '@/lib/createSchemas';
import { validate } from '@/lib/validation';

const DURATION_OPTIONS = POLL_DURATIONS.map((d) => ({ value: d.hours, label: d.label }));

/** Question, 2 to 6 choices and a duration. Polls never carry photos. */
export function PollForm({ userId }: { userId: string }) {
  const { colors } = useTheme();
  const draft = useDraft(userId, 'poll', { question: '', options: ['', ''], hours: DEFAULT_POLL_HOURS });
  const touched = useTouched<'question' | 'options'>();
  const { submit, submitting, error } = useCreateSubmit();
  const { question, options, hours } = draft.values;
  const result = validate(pollSchema, { question, options, hours });
  const errors = result.errors ?? {};
  const locked = submitting;

  const setOption = (index: number, text: string) => {
    draft.set(
      'options',
      options.map((o, i) => (i === index ? text : o)),
    );
    touched.touch('options');
  };

  const onSubmit = () => {
    if (!result.data) return;
    const input = { kind: 'poll' as const, ...result.data };
    void submit({
      run: () => createPost(input, []),
      onSuccess: () => {
        draft.clear();
        touched.reset();
      },
    });
  };

  return (
    <View className="gap-5">
      <TextField
        label="Question"
        value={question}
        onChangeText={(t) => {
          draft.set('question', t);
          touched.touch('question');
        }}
        placeholder="Ask the campus something…"
        multiline
        maxLength={LIMITS.pollQuestion}
        counter={{ length: question.length, max: LIMITS.pollQuestion }}
        error={touched.isTouched('question') ? errors.question : undefined}
        editable={!locked}
      />

      <View className="gap-3">
        {options.map((option, index) => (
          <TextField
            // Choices only append or remove from the end, so the index is stable.
            key={index}
            label={`Choice ${index + 1}`}
            value={option}
            onChangeText={(t) => setOption(index, t)}
            maxLength={LIMITS.pollOption}
            editable={!locked}
            accessory={
              options.length > LIMITS.pollOptionsMin && index === options.length - 1 ? (
                <Pressable
                  onPress={() => draft.set('options', options.slice(0, -1))}
                  hitSlop={10}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove choice ${index + 1}`}
                >
                  <Ionicons name="close-circle" size={20} color={colors.textDim} />
                </Pressable>
              ) : undefined
            }
          />
        ))}
        {touched.isTouched('options') && errors.options ? (
          <Text accessibilityLiveRegion="polite" className="text-sm text-danger">
            {errors.options}
          </Text>
        ) : null}
        {options.length < LIMITS.pollOptionsMax ? (
          <Pressable
            onPress={() => draft.set('options', [...options, ''])}
            disabled={locked}
            accessibilityRole="button"
            className="flex-row items-center gap-2 self-start py-1"
          >
            <Ionicons name="add-circle-outline" size={20} color={colors.accent} />
            <Text className="text-sm font-bold text-text">Add a choice</Text>
          </Pressable>
        ) : null}
      </View>

      <View className="gap-2">
        <Text className="text-xs font-bold uppercase tracking-widest text-text-dim">Runs for</Text>
        <ChipGroup
          options={DURATION_OPTIONS}
          value={hours}
          onChange={(h) => draft.set('hours', h)}
          accessibilityLabel="Poll duration"
          disabled={locked}
        />
      </View>

      <SubmitFooter
        label="Post poll"
        onPress={onSubmit}
        submitting={submitting}
        disabled={!result.data}
        error={error}
      />
    </View>
  );
}
