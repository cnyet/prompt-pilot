import { EvalWorkspace } from '@/components/eval/EvalWorkspace'

export default function EvalPage() {
  return (
    <div className="mx-auto flex w-full max-w-[1080px] flex-col gap-8 px-6 py-8 lg:px-10">
      <EvalWorkspace />
    </div>
  )
}