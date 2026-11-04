import { State, today, WORKS, DOCTORS, TECHNICIANS } from './model'
export function demoState(): State {
  const date = today()
  const names = ['Анна Смирнова (демо)', 'Михаил Иванов (демо)', 'Елена Петрова (демо)']
  const patients = names.map((name, i) => ({
    id: 'demo-p' + i,
    name,
    note: 'Вымышленный пациент для демонстрации',
  }))
  const orders = WORKS.map((w, i) => ({
    id: 'demo-o' + i,
    number: 1001 + i,
    patientId: patients[i % 3].id,
    createdAt: date,
    dueDate: date,
    appointment: '',
    status: (i % 2 === 0 ? 'done' : 'in_progress') as 'done' | 'in_progress',
    // Последний наряд сразу в архиве — видно, как работает раздел.
    archived: i === WORKS.length - 1,
    // Врачи чередуются, чтобы в демо-отчёте была разбивка по обоим.
    doctor: DOCTORS[i % DOCTORS.length],
    technician: TECHNICIANS[i % TECHNICIANS.length],
    fittingAt: '',
    isPaid: i % 2 === 0,
    salary: i % 2 === 0 ? w.price * 0.6 : 0,
    needsClarification: false,
    comment: 'Демонстрационный наряд',
    paid: w.price * (i === 0 ? 2 : 1) * 0.6,
    paidOn: i % 2 === 0 ? date : '',
    items: Array.from({ length: i === 0 ? 2 : 1 }, (_, j) => ({
      id: `demo-i${i}-${j}`,
      tooth: 11 + i + j,
      workId: w.id,
      material: w.material,
      support: w.support,
      shade: 'A2',
      price: w.price,
    })),
  }))
  return { version: 1, patients, orders, salary: [], monthlySalary: 50000 }
}
