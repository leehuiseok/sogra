export type ProgressBarProps = {
  currentStep: number
}

export default function ProgressBar({ currentStep }: ProgressBarProps) {
  const totalSteps = 4
  const remaining = Math.round((totalSteps - currentStep) * 1.4)

  return (
    <div className="w-full mb-8">
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-700">Step {currentStep} / {totalSteps}</span>
        {currentStep < totalSteps && (
          <span className="text-xs text-gray-400">약 {remaining}분 남음</span>
        )}
      </div>
      <div className="flex items-center gap-0">
        {Array.from({ length: totalSteps }, (_, i) => {
          const step = i + 1
          const isCompleted = step < currentStep
          const isCurrent = step === currentStep

          return (
            <div key={step} className="flex items-center flex-1 last:flex-none">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold flex-shrink-0 ${
                  isCurrent
                    ? 'bg-orange-500 text-white'
                    : isCompleted
                    ? 'bg-orange-200 text-orange-700'
                    : 'bg-gray-200 text-gray-400'
                }`}
              >
                {step}
              </div>
              {step < totalSteps && (
                <div
                  className={`flex-1 h-1 ${
                    isCompleted ? 'bg-orange-300' : 'bg-gray-200'
                  }`}
                />
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
