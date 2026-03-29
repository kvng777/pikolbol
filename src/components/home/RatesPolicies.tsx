export default function RatesPolicies() {
  return (
    <section id="rates" className="mb-12">
      <div className="max-w-3xl mx-auto bg-white/60 backdrop-blur-sm rounded-xl p-6 border border-gray-100">
        <h2 className="text-2xl font-bold text-gray-900 mb-4">Rates & Policies</h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div className="p-4 bg-emerald-50 rounded-lg">
            <h3 className="text-lg font-semibold text-emerald-700 mb-2">Rates</h3>
            <ul className="text-gray-700 space-y-2">
              <li>
                <span className="font-medium">Daytime (7:00 AM - 6:00 PM):</span> Php 200 / hour
              </li>
              <li>
                <span className="font-medium">Evening (6:00 PM - 9:00 PM):</span> Php 250 / hour
              </li>
              <li className="text-sm text-emerald-600 font-semibold mt-2">FREE use of paddles & balls (promo!)</li>
            </ul>
          </div>

          <div className="p-4 bg-gray-50 rounded-lg">
            <h3 className="text-lg font-semibold text-gray-800 mb-2">Policies</h3>
            <ul className="text-gray-700 space-y-2">
              <li>
                <span className="font-medium">Cancellation Policy:</span>
                <div className="mt-1">
                  <div className="flex items-start gap-2">
                    <span className="font-semibold text-green-600">Free</span>
                    <span className="text-sm text-gray-600"> — Cancel 24 hours before booking</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="font-semibold text-amber-600">P100/hour</span>
                    <span className="text-sm text-gray-600"> — Cancellation within 24 hours</span>
                  </div>
                </div>
              </li>
              <li>
                <span className="font-medium">No-Show:</span> Full fee will be charged
              </li>
              <li>
                <span className="font-medium">Other Equipment:</span> Charged separately upon request
              </li>
            </ul>
          </div>
        </div>

        <p className="text-xs text-gray-500">Prices and policies are subject to change. For group bookings or special requests, please contact us.</p>
      </div>
    </section>
  )
}
